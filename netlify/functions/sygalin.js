// Recharge MyPOS via Sygalin SAS (Orange Money / MTN Mobile Money), reprise d'Aria.
// Argent réel : aucun nouvel essai automatique du paiement. Les identifiants et la session arrivent à chaque appel (rien n'est conservé ici).
const SYG = "https://www.sygalin-tvsat.com";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36", "accept-language": "fr-FR,fr;q=0.9" };
const J = (status, body) => ({ statusCode: status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
const OPS = {
  orange: { paymode: "1", nom: "ORANGE MONEY", ok: (n) => /^(69\d{7}|65[5-9]\d{6})$/.test(n) },
  mtn: { paymode: "2", nom: "MTN MOBILE MONEY", ok: (n) => /^(67\d{7}|68\d{7}|65[0-4]\d{6})$/.test(n) },
};
const MIN = +(process.env.RECHARGE_MIN || 1000), MAX = +(process.env.RECHARGE_MAX || 500000);
const XHR = { "x-requested-with": "XMLHttpRequest", origin: SYG, referer: SYG + "/index.php/cga/refill/std" };
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const form = (o) => new URLSearchParams(o).toString();
const plain = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

class Jar {
  constructor(c) { this.c = c && typeof c === "object" ? { ...c } : {}; }
  add(res) { for (const s of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = s.split(";")[0], i = kv.indexOf("="); this.c[kv.slice(0, i).trim()] = kv.slice(i + 1); } }
  get header() { return Object.entries(this.c).map(([k, v]) => k + "=" + v).join("; "); }
}
async function http(jar, url, { method = "GET", headers = {}, body } = {}) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, { method, body, redirect: "manual", signal: AbortSignal.timeout(20000), headers: { ...UA, ...headers, ...(jar.header && { cookie: jar.header }) } });
    jar.add(res);
    if ([301, 302, 303, 307, 308].includes(res.status)) { url = new URL(res.headers.get("location"), url).href; if (![307, 308].includes(res.status)) { method = "GET"; body = undefined; } continue; }
    return { res, url };
  }
  throw new Error("Trop de redirections");
}
async function login(user, pass) {
  const j = new Jar(), page = await http(j, SYG + "/index.php/auth/login");
  const html = await page.res.text();
  const csrf = (/name="ci_csrf_token"\s+value="([^"]*)"/.exec(html) || [])[1] || "";
  await http(j, SYG + "/index.php/Auth/getCredentials", { method: "POST", headers: { ...FORM, "x-requested-with": "XMLHttpRequest", referer: SYG + "/index.php/auth/login" }, body: form({ cuser: user }) });
  const { res, url } = await http(j, SYG + "/index.php/auth/login", { method: "POST", headers: { ...FORM, origin: SYG, referer: SYG + "/index.php/auth/login" }, body: form({ ci_csrf_token: csrf, rToken: "", rAction: "auth_captcha", login: user, pwd: pass }) });
  await res.text();
  if (!/\/index\.php\/home/.test(url)) { const e = new Error("Connexion refusée par Sygalin (identifiants, ou captcha exigé)"); e.auth = true; throw e; }
  return j;
}
// Session réutilisée si elle est encore valable, sinon une seule nouvelle connexion
async function ready(q, st) {
  for (let k = 0; k < 2; k++) {
    if (!st.jar) st.jar = await login(String(q.user), String(q.pass));
    const { res, url } = await http(st.jar, SYG + "/index.php/cga/refill/std");
    const h = await res.text();
    if (!/\/auth\/login/.test(url)) return { jar: st.jar, whp: (/id="numberWhp"\s+value="(\d*)"/.exec(h) || [])[1] || "" };
    st.jar = null;
  }
  throw new Error("Session Sygalin impossible à ouvrir");
}
async function sygForm(jar, path, fields) {
  const fd = new FormData();
  for (const [k, v] of fields) fd.append(k, v);
  const { res } = await http(jar, SYG + "/index.php/" + path, { method: "POST", headers: XHR, body: fd });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch (e) { throw new Error("Réponse inattendue de Sygalin (session expirée ?)"); }
  if (d.type && d.type !== "success") throw new Error(d.message || "Refusé par Sygalin");
  return d;
}
async function recharge(q, st) {
  const op = OPS[q.operateur]; if (!op) throw new Error("Opérateur inconnu");
  const montant = Number(q.montant);
  if (!Number.isInteger(montant) || montant < MIN || montant > MAX) throw new Error("Montant entre " + MIN + " et " + MAX + " FCFA");
  const numero = String(q.numero == null ? "" : q.numero).replace(/\D/g, "").replace(/^237/, "");
  if (!op.ok(numero)) throw new Error("Ce numéro n’est pas un numéro " + op.nom);
  let ticket = null;
  try {
    const { jar, whp } = await ready(q, st);
    const base = [["ci_csrf_token", ""], ["linkedTable", "rechargecga"], ["typeRecharge", "0"], ["paymode", op.paymode], ["accountToCredit", ""], ["sendType", "4"], ["numberWhp", whp], ["pm", "2"]];
    const m = await sygForm(jar, "cga/generatedMotif/MOTIF_VERSEMENTS_AVANCE_SUR_REVENU_DE_LA_VENTE_PREPAYE", base);
    await sygForm(jar, "cga/newProcessRefill/std", [...base, ["motif", m.motif]]);
    const list = await (await http(jar, SYG + "/index.php/cga/requests/myrequests")).res.text();
    ticket = (new RegExp("TEMP_REFERENCE_(\\d+)(?:(?!TEMP_REFERENCE_)[\\s\\S]){0,1500}?" + m.motif).exec(list) || [])[1];
    if (!ticket) throw new Error("Demande créée mais ticket introuvable : vérifiez « Demandes effectuées » sur Sygalin");
    const page = await (await http(jar, SYG + "/index.php/cga/newProcessRefill/std/" + ticket)).res.text();
    const dRemonte = (/name="dRemonte"\s+value="([^"]*)"/.exec(page) || [])[1] || new Date(Date.now() + 36e5).toISOString().slice(0, 19).replace("T", " ");
    const pay = [["ci_csrf_token", ""], ["linkedTable", "rechargecga"], ["typeRecharge", "0"], ["apiPayment", "1"], ["moypay", op.nom], ["typeMoypay", "2"], ["paymode", op.paymode], ["account", numero], ["montant", String(montant)], ["challenge", ""], ["should_confirm", "0"], ["dRemonte", dRemonte], ["pm", ""]];
    const t = await sygForm(jar, "cga/newProcessRefill/std/" + ticket, pay);
    const p = await sygForm(jar, "payment/makeApiPayment", [...pay, ["ticketId", t.ticketId], ["amount", t.amount], ["amountMax", t.amountMax], ["tableId", t.tableId], ["externalId", t.shopId], ["paymodeField", t.paymodeField], ["fileField", t.fileField], ["referenceField", t.referenceField], ["moduleCode", t.moduleCode], ["typePaymode", t.typeMopay], ["descriptionMotif", t.description_motif], ["dateField", t.dateField], ["montantField", t.montantField], ["withPj", t.withPj]]);
    return { success: true, ticket, motif: m.motif, message: p.message, reference: (p.rawResponse && p.rawResponse.data && p.rawResponse.data.paymentReference) || null };
  } catch (e) { e.ticket = ticket; throw e; }
}
async function etat(q, st) {
  const ticket = String(q.ticket || "").replace(/\D/g, "");
  if (!ticket) throw new Error("Ticket manquant");
  const { jar } = await ready(q, st);
  const t = plain(await (await http(jar, SYG + "/index.php/cga/requests/myrequests")).res.text());
  const i = t.indexOf("TEMP_REFERENCE_" + ticket);
  if (i < 0) return { success: true, etat: "Introuvable dans la liste (peut-être déjà traitée)", final: true };
  const w = t.slice(Math.max(0, i - 700), i + 900);
  const e = ((/Etat du paiement\s*:\s*(.+?)\s+Valid/i.exec(w) || [])[1] || "Inconnu").trim();
  return { success: true, etat: e, valide: (/Valid[ée]\s*:\s*(\d+\/\d+)/i.exec(w) || [])[1] || null, final: !/ATTENTE|EN COURS/i.test(e) };
}
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return J(405, { message: "Méthode non autorisée" });
  let q; try { q = JSON.parse(event.body || "{}"); } catch (e) { return J(400, { message: "Requête invalide" }); }
  if (!q.user || !q.pass) return J(401, { message: "Identifiants Sygalin manquants" });
  const st = { jar: q.action !== "test" && q.session && q.session.cookies ? new Jar(q.session.cookies) : null };
  const sess = () => (st.jar ? { session: { cookies: st.jar.c } } : {});
  try {
    if (q.action === "test") { st.jar = await login(String(q.user), String(q.pass)); return J(200, { success: true, message: "Connecté à Sygalin", ...sess() }); }
    if (q.action === "recharge") { const r = await recharge(q, st); return J(200, { ...r, ...sess() }); }
    if (q.action === "status") { const r = await etat(q, st); return J(200, { ...r, ...sess() }); }
    return J(400, { success: false, message: "Action inconnue" });
  } catch (e) {
    const msg = e.name === "TimeoutError" ? "Sygalin ne répond pas : vérifiez « Demandes effectuées » avant de réessayer" : (e.message || "Erreur Sygalin");
    return J(e.auth ? 401 : 400, { success: false, message: msg, ticket: e.ticket || null, ...sess() });
  }
};
