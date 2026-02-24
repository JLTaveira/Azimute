/* App.jsx
 src/App.jsx
 2026-02-16 - Joao Taveira (jltaveira@gmail.com) */

import { useEffect, useMemo, useState } from "react";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

import azimuteLogo from "./assets/azimute.png"; 

import SecaoDashboard from "./pages/SecaoDashboard";
import SubunidadesAdmin from "./pages/SubunidadesAdmin";
import ChefeAgrupamentoDashboard from "./pages/ChefeAgrupamentoDashboard";
import ElementoObjetivos from "./pages/ElementoObjetivos";
import GuiaObjetivosGrupo from "./pages/GuiaObjetivosGrupo";
import ChefeUnidadeObjetivos from "./pages/ChefeUnidadeObjetivos";
import SecretarioAgrupamentoDashboard from "./pages/SecretarioAgrupamentoDashboard";

const isDirigente = (p) => p?.tipo === "DIRIGENTE";
const isElemento = (p) => p?.tipo === "ELEMENTO";
const hasFuncao = (p, f) => Array.isArray(p?.funcoes) && p.funcoes.includes(f);

function getTerminologia(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia")) return { plural: "Bandos", singular: "Bando", labelObjetivosGrupo: "Objetivos (Bando)" };
  if (s.includes("expedicao")) return { plural: "Patrulhas", singular: "Patrulha", labelObjetivosGrupo: "Objetivos (Patrulha)" };
  if (s.includes("comunidade")) return { plural: "Equipas", singular: "Equipa", labelObjetivosGrupo: "Objetivos (Equipa)" };
  if (s.includes("cla")) return { plural: "Tribos", singular: "Tribo", labelObjetivosGrupo: "Objetivos (Tribo)" };
  return { plural: "Subunidades", singular: "Subunidade", labelObjetivosGrupo: "Objetivos (Grupo)" };
}

const isValidNin = (nin) => /^\d{13}$/.test(String(nin || ""));
const ninToEmail = (nin) => `${nin}@azimute.cne`;

export default function App() {
  const [ninInput, setNinInput] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agrupamentoNome, setAgrupamentoNome] = useState("");
  const [secaoNome, setSecaoNome] = useState("");
  const [err, setErr] = useState("");
  const [view, setView] = useState("dashboard");

  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);

      // Se não há ninguém autenticado (por exemplo, após um Logout forçado)
      if (!u) { 
        setUser(null); 
        setProfile(null); 
        setLoading(false); 
        return; 
      }
      
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const p = snap.data(); 

          // 🚨 SEGURANÇA MÁXIMA: Verifica primeiro se é AUXILIAR
          if (Array.isArray(p.funcoes) && p.funcoes.includes("AUXILIAR")) {
            await signOut(auth); // Desliga a sessão no servidor da Google
            setErr("Acesso negado: O perfil 'Auxiliar' é de registo interno e não tem permissão para entrar no sistema.");
            setLoading(false);
            return; // Aborta tudo. A porta não se abre (setUser não é chamado).
          }

          // Se chegou aqui, é porque o perfil é válido e não é Auxiliar!
          setErr(""); // Limpa os erros do login
          setUser(u); // ABRE A PORTA!
          setProfile(p);
          
          const metaPromises = [];
          if (p.agrupamentoId) metaPromises.push(getDoc(doc(db, "agrupamento", p.agrupamentoId)));
          if (p.agrupamentoId && p.secaoDocId) metaPromises.push(getDoc(doc(db, "agrupamento", p.agrupamentoId, "secoes", p.secaoDocId)));
          const [aSnap, sSnap] = await Promise.all(metaPromises);
          if (aSnap?.exists()) setAgrupamentoNome(aSnap.data().nome || "");
          if (sSnap?.exists()) setSecaoNome(sSnap.data().nome || "");
          if (p.tipo === "ELEMENTO") setView("objetivos"); else setView("dashboard");
        } else { 
          await signOut(auth);
          setErr("Perfil não encontrado na base de dados."); 
        }
      } catch (e) { 
        await signOut(auth);
        setErr("Erro de ligação ao servidor."); 
      } 
      finally { setLoading(false); }
    });
    return () => unsub();
  }, []);

  async function doLogin(e) {
    e.preventDefault(); 
    setErr("");
    if (!isValidNin(ninInput)) { setErr("O NIN deve ter 13 dígitos."); return; }
    try { 
      await signInWithEmailAndPassword(auth, ninToEmail(ninInput), password); 
    } catch (e) { 
      setErr("Credenciais inválidas ou erro de acesso."); 
    }
  }

  const doLogout = () => { signOut(auth); setView("dashboard"); };

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwdErr(""); setPwdSuccess("");

    if (pwdNew !== pwdConfirm) { setPwdErr("As novas passwords não coincidem."); return; }
    if (pwdNew.length < 6) { setPwdErr("A nova password tem de ter pelo menos 6 caracteres."); return; }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const credential = EmailAuthProvider.credential(currentUser.email, pwdCurrent);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, pwdNew);
      
      setPwdSuccess("Password alterada com sucesso!");
      setTimeout(() => {
        setShowPwdModal(false);
        setPwdCurrent(""); setPwdNew(""); setPwdConfirm(""); setPwdSuccess("");
      }, 2000);

    } catch (error) {
      if (error.code === 'auth/invalid-credential') {
        setPwdErr("A password atual está incorreta.");
      } else {
        setPwdErr("Erro ao alterar password. Tenta novamente.");
      }
    }
  }

  async function handleForcedPasswordChange(e) {
    e.preventDefault();
    setPwdErr(""); setPwdSuccess("");

    if (pwdNew !== pwdConfirm) { setPwdErr("As passwords não coincidem."); return; }
    if (pwdNew.length < 6) { setPwdErr("Tem de ter pelo menos 6 caracteres."); return; }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updatePassword(currentUser, pwdNew);
      
      await updateDoc(doc(db, "users", currentUser.uid), {
        forcarMudancaPassword: false,
        updatedAt: new Date()
      });

      setProfile(prev => ({ ...prev, forcarMudancaPassword: false }));
      setPwdNew(""); setPwdConfirm("");
    } catch (error) {
      setPwdErr("Sessão expirada ou erro. Faz logout e login novamente com a password predefinida.");
    }
  }

  const flags = useMemo(() => {
    if (!profile) return {};
    return {
      isDirigente: isDirigente(profile), isElemento: isElemento(profile),
      isCU: hasFuncao(profile, "CHEFE_UNIDADE"), isCA: hasFuncao(profile, "CHEFE_AGRUPAMENTO"),
      isSA: hasFuncao(profile, "SECRETARIO_AGRUPAMENTO"), isGuia: profile.isGuia || profile.isSubGuia
    };
  }, [profile]);

  const termo = useMemo(() => getTerminologia(profile?.secaoDocId), [profile?.secaoDocId]);
  const ninFormatado = useMemo(() => { const em = String(user?.email || ""); const idx = em.indexOf("@"); return idx > 0 ? em.slice(0, idx) : em; }, [user?.email]);
  const labelAgrupamento = useMemo(() => {
    if (!profile?.agrupamentoId) return agrupamentoNome || "CNE";
    const numero = profile.agrupamentoId.split('_')[0]; 
    return `${numero} ${agrupamentoNome || ""}`.trim();
  }, [profile?.agrupamentoId, agrupamentoNome]);

  useEffect(() => {
    if (!profile) return;
    const fallback = flags.isElemento ? "objetivos" : "dashboard";
    if (view === "chefe_agrupamento" && !flags.isCA) setView(fallback);
    if (view === "secretario_agrupamento" && !flags.isSA) setView(fallback);
    if (view === "guia_grupo" && !flags.isGuia) setView(fallback);
    if ((view === "subunidades" || view === "cu_objetivos") && !flags.isDirigente) setView(fallback);
  }, [view, profile, flags]);

  if (loading) {
    return (
      <div className="az-loading-screen" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <img src={azimuteLogo} alt="Loading..." className="az-logo-pulse" style={{ width: 80 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: user ? `linear-gradient(rgba(15,27,37,0.85), rgba(11,20,27,0.95)), url(${azimuteLogo}) center center / cover fixed` : "none" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>
        
        {!user ? (
          <div className="az-login-container">
            <div className="az-card">
              <div className="az-card-inner">
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <img src={azimuteLogo} alt="Logo" style={{ height: 70, borderRadius: 16, margin: "0 auto" }} />
                  <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 12 }}>AZIMUTE</h1>
                  <p style={{ opacity: 0.7 }}>O teu Norte! O teu Caminho!</p>
                </div>
                <form onSubmit={doLogin} style={{ display: "grid", gap: 16 }}>
                  <div className="az-form-group">
                    <label>NIN (13 dígitos)</label>
                    <input className="az-input" value={ninInput} onChange={(e) => setNinInput(e.target.value.replace(/\D/g, "").slice(0,13))} placeholder="0000000000000" />
                  </div>
                  <div className="az-form-group">
                    <label>Password</label>
                    <input className="az-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" />
                  </div>
                  <button className="az-btn az-btn-primary" disabled={!isValidNin(ninInput)}>Entrar no Agrupamento</button>
                  {err && <div className="az-error-msg" style={{ background: "rgba(220, 38, 38, 0.1)", color: "#ef4444", padding: "12px", borderRadius: "8px", border: "1px solid rgba(220, 38, 38, 0.3)", fontSize: "14px", fontWeight: "600", textAlign: "center" }}>{err}</div>}
                </form>
              </div>
            </div>
          </div>
        ) : profile?.forcarMudancaPassword ? (
          <div className="az-login-container" style={{ marginTop: "10vh" }}>
            <div className="az-card" style={{ borderColor: "var(--brand-orange)" }}>
              <div className="az-card-inner">
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 40 }}>⚠️</div>
                  <h2 className="az-h2" style={{ color: "var(--brand-orange)", marginTop: 8 }}>Mudança Obrigatória</h2>
                  <p className="az-muted az-small">A tua password foi reiniciada pela Chefia. Define agora a tua nova password secreta para entrares no Azimute.</p>
                </div>

                <form onSubmit={handleForcedPasswordChange} style={{ display: "grid", gap: 16 }}>
                  <div className="az-form-group">
                    <label>Nova Password</label>
                    <input type="password" required className="az-input" value={pwdNew} onChange={e => setPwdNew(e.target.value)} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div className="az-form-group">
                    <label>Confirmar Password</label>
                    <input type="password" required className="az-input" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)} placeholder="Repete a password" />
                  </div>
                  
                  {pwdErr && <div className="az-alert az-alert--error">{pwdErr}</div>}
                  
                  <button className="az-btn az-btn-primary" type="submit" style={{ fontWeight: 800, padding: 14 }}>💾 Guardar e Entrar</button>
                </form>
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <button className="az-btn" style={{ fontSize: 12 }} onClick={doLogout}>Cancelar e Sair</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="az-app-grid">
            <header className="az-header" style={{ background: "rgba(15,27,37,0.6)", backdropFilter: "blur(10px)" }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <img src={azimuteLogo} style={{ height: 40, borderRadius: 8 }} alt="Az" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{profile?.nome}</div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>NIN: {ninFormatado}</div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="az-btn" style={{ borderColor: "rgba(255,255,255,0.2)" }} onClick={() => setShowPwdModal(true)}>🔑 Mudar Password</button>
                <button className="az-btn" onClick={doLogout}>Sair</button>
              </div>
            </header>

            <div className="az-breadcrumb">
               <span><b>{labelAgrupamento}</b></span> / <span>{secaoNome || "Secção"}</span>
            </div>

            <nav className="az-tabs">
              {flags.isElemento && <button className={`az-tab ${view === "objetivos" ? "active" : ""}`} onClick={() => setView("objetivos")}>Meus Objetivos</button>}
              {flags.isGuia && <button className={`az-tab ${view === "guia_grupo" ? "active" : ""}`} onClick={() => setView("guia_grupo")}>{termo.labelObjetivosGrupo}</button>}
              {flags.isDirigente && (
                <>
                  <button className={`az-tab ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>Dashboard</button>
                  <button className={`az-tab ${view === "subunidades" ? "active" : ""}`} onClick={() => setView("subunidades")}>{termo.plural}</button>
                  <button className={`az-tab ${view === "cu_objetivos" ? "active" : ""}`} onClick={() => setView("cu_objetivos")}>Objetivos Educativos</button>
                </>
              )}
              {flags.isSA && <button className={`az-tab ${view === "secretario_agrupamento" ? "active" : ""}`} onClick={() => setView("secretario_agrupamento")}>Secretaria</button>}
              {flags.isCA && <button className={`az-tab ${view === "chefe_agrupamento" ? "active" : ""}`} onClick={() => setView("chefe_agrupamento")}>Adultos</button>}
            </nav>

            <main className="az-content">
              {view === "objetivos" && <ElementoObjetivos profile={profile} />}
              {view === "guia_grupo" && <GuiaObjetivosGrupo profile={profile} />}
              {view === "subunidades" && <SubunidadesAdmin profile={profile} readOnly={!flags.isCU} />}
              {view === "cu_objetivos" && <ChefeUnidadeObjetivos profile={profile} readOnly={!flags.isCU} />}
              {view === "secretario_agrupamento" && <SecretarioAgrupamentoDashboard profile={profile} />}
              {view === "chefe_agrupamento" && <ChefeAgrupamentoDashboard profile={profile} />}
              {view === "dashboard" && <SecaoDashboard profile={profile} onOpenGuiaObjetivos={() => setView("guia_grupo")} />}
            </main>

            {showPwdModal && (
              <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(5px)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
                <div className="az-card" style={{ width: "100%", maxWidth: 400, background: "var(--bg-dark)" }}>
                  <div className="az-card-inner">
                    <h3 style={{ margin: "0 0 16px 0", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>🔑 Mudar Password</h3>
                    
                    <form onSubmit={handleChangePassword} style={{ display: "grid", gap: 16 }}>
                      <div className="az-form-group">
                        <label>Password Atual</label>
                        <input type="password" required className="az-input" value={pwdCurrent} onChange={e => setPwdCurrent(e.target.value)} />
                      </div>
                      <div className="az-form-group">
                        <label>Nova Password</label>
                        <input type="password" required className="az-input" value={pwdNew} onChange={e => setPwdNew(e.target.value)} />
                      </div>
                      <div className="az-form-group">
                        <label>Confirmar Nova Password</label>
                        <input type="password" required className="az-input" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)} />
                      </div>

                      {pwdErr && <div className="az-small" style={{ color: "var(--danger)" }}>{pwdErr}</div>}
                      {pwdSuccess && <div className="az-small" style={{ color: "var(--brand-green)", fontWeight: 800 }}>{pwdSuccess}</div>}

                      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                        <button type="button" className="az-btn" onClick={() => { setShowPwdModal(false); setPwdErr(""); setPwdCurrent(""); setPwdNew(""); setPwdConfirm(""); }}>Cancelar</button>
                        <button type="submit" className="az-btn az-btn-teal" style={{ fontWeight: 800 }}>Guardar Nova Password</button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}