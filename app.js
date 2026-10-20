(() => {
  "use strict";

  // Aplicación real: requiere config.js, Supabase Auth y el esquema SQL del proyecto.
  const $ = (selector) => document.querySelector(selector);
  const screens = [
    "pantalla-login", "pantalla-registro", "pantalla-inicio",
    "pantalla-menu-partidas", "pantalla-crear-partida",
    "pantalla-unirse-partida", "pantalla-perfil"
  ];
  const messages = {
    login: $("#mensaje-login"),
    registro: $("#mensaje-registro"),
    unirse: $("#mensaje-unirse")
  };
  const INTERNAL_DOMAIN = "example.com";
  let db = null;
  let currentUser = null;
  let busy = false;

  // Alias sintácticamente válido para cuentas de jugadores sin correo propio.
  // Los jugadores usan nombre de usuario; los organizadores pueden entrar con su correo real.
  // Desactivá la confirmación por email en Supabase porque las cuentas de jugador no reciben correo.
  const usernameEmail = (name) => `${String(name || "").trim().toLowerCase()}@${INTERNAL_DOMAIN}`;
  const validUsername = (name) => /^[a-zA-Z0-9_.-]{3,24}$/.test(name);

  function showScreen(id) {
    screens.forEach((screenId) => {
      const node = document.getElementById(screenId);
      if (node) node.hidden = screenId !== id;
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function clearMessages() {
    Object.values(messages).forEach((node) => { if (node) node.textContent = ""; });
  }

  function message(which, text, isError = false) {
    const node = messages[which];
    if (!node) return;
    node.textContent = text || "";
    node.style.color = isError ? "var(--color-error)" : "var(--color-acento)";
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = value; });
  }

  function explainError(error) {
    const text = String(error?.message || error || "");
    const lower = text.toLowerCase();
    if (/invalid login credentials|invalid email or password/.test(lower)) return "El usuario o la contraseña son incorrectos.";
    if (/user already registered|already exists|duplicate key|unique constraint/.test(lower)) return "Ese nombre de usuario ya está registrado. Elegí otro.";
    if (/password should be at least|password.*characters/.test(lower)) return "La contraseña debe tener al menos 8 caracteres.";
    if (/email not confirmed/.test(lower)) return "La confirmación por correo está activada. Desactivala en Supabase Auth para usar cuentas de usuario y contraseña.";
    if (/failed to fetch|networkerror|network request failed|load failed/.test(lower)) return "No se pudo conectar con el servidor. Revisá tu conexión.";
    if (/function .* does not exist|could not find the function|schema cache/.test(lower)) return "Falta crear una función SQL requerida en Supabase. La definiremos en la etapa de base de datos.";
    if (/permission denied|row-level security|violates row-level security/.test(lower)) return "Supabase rechazó la operación por permisos. Hay que revisar las políticas de seguridad.";
    if (/invalid.*code|code.*not found|partida.*no existe|no existe.*partida/.test(lower)) return "No encontramos una partida con ese código.";
    return text || "Ocurrió un error inesperado.";
  }

  async function loadConfig() {
    if (!window.TESORO_CONFIG) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "./config.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("No se pudo cargar config.js."));
        document.head.appendChild(script);
      });
    }
    const config = window.TESORO_CONFIG;
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) throw new Error("Faltan supabaseUrl o supabaseAnonKey en config.js.");
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    db = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  async function getProfile(authUser) {
    const { data, error } = await db.from("perfiles")
      .select("id, nombre_usuario, puntos_totales").eq("id", authUser.id).maybeSingle();
    if (error) throw error;
    if (data) return data;

    // Crea el perfil asociado a una cuenta autenticada; no usa usuarios ficticios.
    const name = authUser.user_metadata?.nombre_usuario || authUser.email?.split("@")[0];
    if (!name) throw new Error("La cuenta no tiene un nombre de usuario asociado.");
    const { data: profile, error: insertError } = await db.from("perfiles")
      .upsert({ id: authUser.id, nombre_usuario: name.toLowerCase(), puntos_totales: 0 }, { onConflict: "id" })
      .select("id, nombre_usuario, puntos_totales").single();
    if (insertError) throw insertError;
    return profile;
  }

  async function openHome(authUser) {
    const profile = await getProfile(authUser);
    currentUser = authUser;
    const name = profile.nombre_usuario || "Jugador";
    const points = String(Number(profile.puntos_totales || 0));
    $("#nombre-usuario").textContent = name;
    $("#total-puntos").textContent = points;
    $("#perfil-nombre-usuario").textContent = name;
    $("#perfil-total-puntos").textContent = points;
    showScreen("pantalla-inicio");
  }

  async function register(event) {
    event.preventDefault();
    if (busy) return;
    clearMessages();
    const name = $("#registro-usuario").value.trim().toLowerCase();
    const password = $("#registro-contrasena").value;
    const confirm = $("#registro-confirmar-contrasena").value;
    if (!validUsername(name)) {
      message("registro", "El usuario debe tener entre 3 y 24 caracteres: letras, números, punto, guion o guion bajo.", true); return;
    }
    if (password.length < 8) { message("registro", "La contraseña debe tener al menos 8 caracteres.", true); return; }
    if (password !== confirm) { message("registro", "Las contraseñas no coinciden.", true); return; }

    setBusy(true);
    try {
      const { data, error } = await db.auth.signUp({
        email: usernameEmail(name), password,
        options: { data: { nombre_usuario: name } }
      });
      if (error) throw error;
      if (!data.session || !data.user) {
        message("registro", "Supabase no inició sesión tras el registro. Desactivá la confirmación por correo en Supabase Auth; este sistema usa nombres de usuario, no correos reales.", true); return;
      }
      await getProfile(data.user);
      // El registro no deja al usuario dentro de la aplicación: vuelve al login.
      await db.auth.signOut();
      $("#form-registro").reset();
      $("#login-usuario").value = name;
      $("#login-contrasena").value = "";
      showScreen("pantalla-login");
      message("login", "Cuenta creada correctamente. Ahora iniciá sesión con tu usuario y contraseña.");
    } catch (error) {
      message("registro", explainError(error), true);
      console.error("Error al registrar:", error);
    } finally { setBusy(false); }
  }

  async function login(event) {
    event.preventDefault();
    if (busy) return;
    clearMessages();
    const name = $("#login-usuario").value.trim().toLowerCase();
    const password = $("#login-contrasena").value;
    if (!name || !password) { message("login", "Ingresá tu usuario o correo y contraseña.", true); return; }
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name);
    if (!isEmail && !validUsername(name)) { message("login", "Ingresá un nombre de usuario válido o un correo electrónico.", true); return; }

    setBusy(true);
    try {
      const { data, error } = await db.auth.signInWithPassword({ email: isEmail ? name : usernameEmail(name), password });
      if (error) throw error;
      await openHome(data.user);
      $("#form-login").reset();
    } catch (error) {
      message("login", explainError(error), true);
      console.error("Error al iniciar sesión:", error);
    } finally { setBusy(false); }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      currentUser = null;
      $("#form-login").reset();
      clearMessages();
      showScreen("pantalla-login");
    } catch (error) {
      window.alert(`No se pudo cerrar la sesión: ${explainError(error)}`);
    } finally { setBusy(false); }
  }

  async function createMatch(event) {
    event.preventDefault();
    if (busy) return;
    if (!currentUser) { showScreen("pantalla-login"); return; }
    setBusy(true);
    $("#resultado-partida").hidden = true;
    try {
      // SQL genera el código en el servidor y agrega al creador a la sala.
      const { data, error } = await db.rpc("crear_partida", {
        p_nombre: $("#nombre-partida").value.trim() || null
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      const code = typeof result === "string" ? result : result?.codigo || result?.code || result?.codigo_partida;
      if (!code) throw new Error("crear_partida no devolvió un código de sala.");
      $("#codigo-partida").textContent = code;
      $("#resultado-partida").hidden = false;
    } catch (error) {
      window.alert(`No se pudo crear la partida: ${explainError(error)}`);
      console.error("Error al crear partida:", error);
    } finally { setBusy(false); }
  }

  async function joinMatch(event) {
    event.preventDefault();
    if (busy) return;
    if (!currentUser) { showScreen("pantalla-login"); return; }
    clearMessages();
    const code = $("#codigo-para-unirse").value.trim().toUpperCase();
    if (!code) { message("unirse", "Ingresá el código de la partida.", true); return; }

    setBusy(true);
    try {
      const { error } = await db.rpc("unirse_partida", { p_codigo: code });
      if (error) throw error;
      message("unirse", "Te uniste correctamente a la partida.");
      $("#codigo-para-unirse").value = "";
    } catch (error) {
      message("unirse", explainError(error), true);
      console.error("Error al unirse a la partida:", error);
    } finally { setBusy(false); }
  }

  function bindEvents() {
    $("#ir-a-registro").addEventListener("click", () => { clearMessages(); $("#form-registro").reset(); showScreen("pantalla-registro"); });
    $("#volver-a-login").addEventListener("click", () => { clearMessages(); $("#form-login").reset(); showScreen("pantalla-login"); });
    $("#form-login").addEventListener("submit", login);
    $("#form-registro").addEventListener("submit", register);
    $("#empezar-a-jugar").addEventListener("click", () => showScreen("pantalla-menu-partidas"));
    $("#ir-a-crear-partida").addEventListener("click", () => { $("#form-crear-partida").reset(); $("#resultado-partida").hidden = true; showScreen("pantalla-crear-partida"); });
    $("#ir-a-unirse-partida").addEventListener("click", () => { $("#form-unirse-partida").reset(); message("unirse", ""); showScreen("pantalla-unirse-partida"); });
    $("#volver-a-inicio").addEventListener("click", () => showScreen("pantalla-inicio"));
    $("#form-crear-partida").addEventListener("submit", createMatch);
    $("#form-unirse-partida").addEventListener("submit", joinMatch);
    $("#volver-menu-desde-crear").addEventListener("click", () => showScreen("pantalla-menu-partidas"));
    $("#volver-menu-desde-unirse").addEventListener("click", () => showScreen("pantalla-menu-partidas"));
    $("#abrir-perfil").addEventListener("click", () => showScreen("pantalla-perfil"));
    $("#cerrar-perfil").addEventListener("click", () => showScreen("pantalla-inicio"));
    $("#cerrar-sesion").addEventListener("click", logout);
  }

  async function start() {
    bindEvents();
    try {
      await loadConfig();
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      if (data.session?.user) {
        try { await openHome(data.session.user); }
        catch (error) {
          console.error("No se pudo cargar el perfil:", error);
          message("login", `No se pudo cargar tu perfil: ${explainError(error)}`, true);
          showScreen("pantalla-login");
        }
      } else showScreen("pantalla-login");

      db.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          currentUser = null;
          showScreen("pantalla-login");
        }
        // El inicio de sesión y la restauración de sesión navegan desde sus propios flujos.
      });
    } catch (error) {
      console.error("No se pudo iniciar la aplicación:", error);
      showScreen("pantalla-login");
      message("login", `No se pudo conectar con Supabase: ${explainError(error)}`, true);
    }
  }

  document.addEventListener("DOMContentLoaded", start, { once: true });
})();
