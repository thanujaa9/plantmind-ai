"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ChevronDown, Database, ExternalLink, Factory, FileClock, FileSearch, FileText, Gauge, History, Search, ShieldCheck, Sparkles, Thermometer, Trash2, Wrench } from "lucide-react";

type Citation = { id: string; document: string; type: string; page: number; text: string; sourceUrl?: string };
type Result = { status: string; answer: string; evidenceStrength: string; basis: string; citations: Citation[]; responseMs: number; retrievalScore?: number; reasoningChecks?: Array<{ label: string; passed: boolean; detail: string }>; generation?: { mode: string; provider: string; model?: string }; auditId?: string };
type Dashboard = { documents: number; pages: number; assets: number; alerts: number; evidenceRecords: number };
type DocumentRecord = { id: string; name: string; mimeType: string; status: string; pageCount: number; chunkCount: number; createdAt: string };
type Evaluation = { cases: number; retrievalHitAt3: number; answerStatusAccuracy: number; citationGroundingRate: number; averageResponseMs: number };
type AssetRecord = { id: string; equipmentType: string; role: "active" | "reference"; risk: "High" | "Low" | "Reference"; documents: Array<{ id: string; name: string; sourceUrl: string }>; readings: { vibration: number | null; temperature: number | null }; limits: { vibrationAlert: number[] | null; vibrationAlarm: number | null; temperatureAlert: number[] | null; temperatureAlarm: number | null }; maintenance: { postponed: number; lateDays: number | null; incomplete: boolean }; relatedIncidentId: string | null };

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard>({ documents: 0, pages: 0, assets: 0, alerts: 0, evidenceRecords: 0 });
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [openCitation, setOpenCitation] = useState<string | null>("1");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);

  useEffect(() => { void refreshDashboard(); }, []);

  async function refreshDashboard() {
    const [dashboardResponse, documentsResponse, evaluationResponse, assetsResponse] = await Promise.all([fetch("/api/dashboard"), fetch("/api/documents"), fetch("/api/evaluation"), fetch("/api/assets")]);
    if (dashboardResponse.ok) setDashboard(await dashboardResponse.json());
    if (documentsResponse.ok) setDocuments(await documentsResponse.json());
    if (evaluationResponse.ok) setEvaluation(await evaluationResponse.json());
    if (assetsResponse.ok) setAssets(await assetsResponse.json());
  }

  async function uploadFiles(files?: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setNotice(`Processing ${index + 1} of ${files.length}: ${file.name}`);
        const data = await fileToBase64(file);
        const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", data }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Upload failed.");
        const indexed = await waitForDocument(payload.id);
        if (indexed.status === "failed") throw new Error(indexed.error || "Document processing failed.");
        await refreshDashboard();
      }
      setNotice(`${files.length} document${files.length === 1 ? "" : "s"} indexed and ready to search.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); }
  }

  async function ask(nextQuestion?: string) {
    const value = nextQuestion || question;
    if (!value.trim() || dashboard.documents === 0) return;
    setQuestion(value);
    setLoading(true);
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value }) });
      setResult(await response.json());
      setOpenCitation(null);
    } finally { setLoading(false); }
  }

  async function removeDocument(document: DocumentRecord) {
    if (!window.confirm(`Delete ${document.name}? Its indexed evidence will also be removed.`)) return;
    const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setNotice(payload.error || "Could not delete this document.");
      return;
    }
    setResult(null);
    setSelectedAsset(null);
    setOpenCitation(null);
    setNotice(`${document.name} and its indexed evidence were deleted.`);
    await refreshDashboard();
  }

  function openAsset(assetId: string) {
    setSelectedAsset(assetId);
    window.setTimeout(() => document.getElementById("asset-profile")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const activeAsset = assets.find((item) => item.role === "active") || null;
  const selectedAssetRecord = assets.find((item) => item.id === selectedAsset) || null;

  return (
    <main>
      <aside className="sidebar">
        <div className="brand"><div className="brandMark"><Sparkles size={18}/></div><div><b>PlantMind</b><span>Industrial AI</span></div></div>
        <nav>
          <a className="active" href="#overview"><Gauge size={18}/>Operations overview</a>
          <a href="#asset-360"><Wrench size={18}/>Asset intelligence</a>
          <a href="#knowledge-library"><BookOpen size={18}/>Knowledge library</a>
          <a href="#risk-center"><AlertTriangle size={18}/>Risk center {dashboard.alerts > 0 && <em>{dashboard.alerts}</em>}</a>
        </nav>
        <div className="sidebarFoot"><ShieldCheck size={19}/><div><b>Evidence grounded</b><span>Every claim is traceable</span></div></div>
      </aside>

      <section className="workspace" id="overview">
        <div className="systemBar"><span><i/>SYSTEM ONLINE</span><b>PlantMind Knowledge Fabric</b><small>{dashboard.documents ? `${dashboard.documents} records connected` : "Awaiting plant records"}</small></div>
        <header className={dashboard.documents ? "liveHeader" : ""}><div><p className="eyebrow">OPERATIONS OVERVIEW</p><h1>Industrial knowledge, connected.</h1><p>{dashboard.documents ? "Uploaded records are indexed and traceable." : "Upload your plant records to build an evidence-grounded operations brain."}</p></div><label className="upload"><FileText size={17}/>{uploading ? "Indexing records..." : "Upload plant records"}<input multiple type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain" disabled={uploading} onChange={(event)=>uploadFiles(event.target.files)}/></label></header>
        {notice && <div className="notice"><CheckCircle2 size={16}/>{notice}</div>}

        <div className="stats">
          <article><span>Documents indexed</span><strong>{dashboard.documents}</strong><small>{dashboard.pages} pages searchable</small></article>
          <article><span>Assets connected</span><strong>{dashboard.assets}</strong><small>{dashboard.evidenceRecords} searchable evidence chunks</small></article>
          <article><span>Open risk alerts</span><strong className={dashboard.alerts > 0 ? "dangerText" : ""}>{dashboard.alerts}</strong><small>{dashboard.alerts ? "Evidence requires action" : "No inference without evidence"}</small></article>
          <article><span>Last query</span><strong>{result ? `${result.responseMs} ms` : "—"}</strong><small>{result ? "Measured API response" : "No query submitted"}</small></article>
        </div>

        {dashboard.alerts > 0 && activeAsset ? <section className="riskCase card" id="risk-center">
          <div className="riskCaseTop"><div className="riskSignal"><AlertTriangle size={20}/></div><div><div className="row"><span className="severity high">HIGH RISK</span><span className="assetTag">{activeAsset.id} · {activeAsset.equipmentType}</span></div><h2>Probable drive-end bearing degradation</h2><span className="detected">Derived from uploaded evidence · Rule PM-BRG-04</span></div><button className="viewButton" onClick={()=>openAsset(activeAsset.id)}>Open Asset 360 <ArrowRight size={16}/></button></div>
          <div className="riskCaseBody"><div><h3>Supporting evidence</h3><ul><li><b>{activeAsset.readings.vibration ?? "—"} mm/s vibration</b> {activeAsset.limits.vibrationAlarm ? `exceeds the ${activeAsset.limits.vibrationAlarm} mm/s alarm boundary` : "is elevated"}</li><li><b>{activeAsset.readings.temperature ?? "—"} C bearing temperature</b> {activeAsset.limits.temperatureAlert ? `is within the ${activeAsset.limits.temperatureAlert.join("–")} C alert range` : "is trending upward"}</li><li><b>{activeAsset.maintenance.postponed} lubrication cycles</b> were postponed</li><li>{activeAsset.relatedIncidentId ? `${activeAsset.relatedIncidentId} provides a comparable historical failure pattern` : "No historical match was discovered"}</li></ul></div><div className="recommendedAction"><span>RECOMMENDED ACTION</span><b>Take offline and inspect immediately</b><p>Vibration exceeds the documented alarm boundary. Reduce load if immediate shutdown is operationally unsafe and require maintenance clearance before return.</p></div><div className="riskSources"><h3>Source records</h3>{activeAsset.documents.slice(0,3).map((doc)=><a key={doc.id} href={doc.sourceUrl} target="_blank" rel="noreferrer"><FileText size={14}/><span>{doc.name}</span><ExternalLink size={13}/></a>)}</div></div>
        </section> : <div className="onboardingCard" id="risk-center"><div className="onboardingIcon"><Database size={23}/></div><div><p className="eyebrow">KNOWLEDGE FABRIC</p><h2>No risks inferred before evidence arrives</h2><p>Select the four prepared demo files together. PlantMind will parse, chunk, index, and connect them before generating any operational alert.</p></div><span>0 inferred alerts</span></div>}

        <div className="contentGrid">
          <section className="copilot card">
            <div className="cardTitle"><div><p className="eyebrow">KNOWLEDGE COPILOT</p><h2>Ask your plant records</h2></div><span className="online"><i/>Grounded</span></div>
            <div className={`questionBox ${dashboard.documents === 0 ? "disabled" : ""}`}><Search size={19}/><input placeholder={dashboard.documents ? "Ask a question across your plant records..." : "Upload records to enable grounded search"} value={question} disabled={dashboard.documents === 0} onChange={(e)=>setQuestion(e.target.value)} onKeyDown={(e)=>e.key === "Enter" && ask()} /><button onClick={()=>ask()} disabled={loading || dashboard.documents === 0 || !question.trim()}>{loading ? "Searching..." : "Ask"}</button></div>
            {dashboard.documents > 0 && <div className="quick"><span>Try:</span><button onClick={()=>ask("What are the safe vibration and temperature limits?")}>Safe operating limits</button><button onClick={()=>ask("When was P-101 manufactured?")}>Unsupported fact test</button></div>}
            {!result ? <div className="copilotEmpty"><div className="emptyOrbit"><Search size={20}/></div><b>{dashboard.documents ? "Ready for your first grounded question" : "Your knowledge workspace is empty"}</b><p>{dashboard.documents ? "PlantMind will retrieve supporting passages, connect evidence, and cite every answer." : "Upload PDF, CSV, or TXT plant records. No answer or alert is generated before evidence is indexed."}</p><div><span><ShieldCheck size={14}/>No unsupported claims</span><span><FileText size={14}/>Source-level citations</span></div></div> : result.status === "answered" ? <div className="answer evidenceAnswer">
              <div className="answerHead"><div className="aiIcon">PM</div><div><b>Evidence-grounded answer</b><span>{result.responseMs} ms · {result.generation?.mode === "llm-grounded" ? `grounded generation via ${result.generation.provider}` : "deterministic evidence engine"}{result.auditId ? ` · audit ${result.auditId.slice(0, 8)}` : ""}</span></div></div>
              <div className="answerCopy"><AnswerWithMarkers text={result.answer} citationCount={result.citations.length}/></div>
              {result.reasoningChecks && <div className="reasoningChecks">{result.reasoningChecks.map((check)=><div key={check.label}><CheckCircle2 size={14}/><span><b>{check.label}</b><small>{check.detail}</small></span></div>)}</div>}
              <RetrievalStrength score={result.retrievalScore || 0} basis={result.basis}/>
            </div> : <div className="insufficientState"><div className="insufficientIcon"><FileSearch size={21}/></div><div><span>INSUFFICIENT EVIDENCE</span><h3>No supporting records found</h3><p>{result.answer}</p><small>PlantMind declined to infer an answer · {result.auditId ? `Audit ${result.auditId.slice(0,8)}` : "Audited refusal"}</small></div></div>}
            {result && result.citations.length > 0 && <div className="sources citationCards"><div className="sourcesHead"><div><b>Sources</b><small>Click a record to inspect the exact retrieved passage</small></div><span>{result.citations.length} retrieved</span></div>{result.citations.map((citation, index)=><article className={`citationCard ${openCitation === citation.id ? "expanded" : ""}`} key={citation.id}><button className="citationMain" onClick={()=>setOpenCitation(openCitation === citation.id ? null : citation.id)}><div className="sourceTypeIcon">{citationIcon(citation)}</div><div><b>{citation.document}</b><span>{citationLabel(citation)} · Page {citation.page}</span><p>{clipExcerpt(citation.text)}</p></div><sup>{index + 1}</sup><ChevronDown size={15}/></button>{openCitation === citation.id && <div className="exactPassage"><span>EXACT RETRIEVED PASSAGE</span><blockquote>“{citation.text}”</blockquote>{citation.sourceUrl && <a href={citation.sourceUrl} target="_blank" rel="noreferrer">Open source document <ExternalLink size={13}/></a>}</div>}</article>)}</div>}
          </section>

          {assets.length > 0 ? <aside className="assetPanel card assetRegistry" id="asset-360"><div className="registryHead"><div><p className="eyebrow">ASSET INTELLIGENCE</p><h2>Discovered equipment</h2></div><span>{assets.length} {assets.length === 1 ? "asset" : "assets"}</span></div><p className="registryIntro">Equipment identities connected only from uploaded records.</p><div className="assetList">{assets.map((item)=><button key={item.id} onClick={()=>openAsset(item.id)}><div className="equipmentIcon">{item.role === "reference" ? <History size={17}/> : <Wrench size={17}/>}</div><div><b>{item.id}</b><span>{item.equipmentType}</span><small>{item.documents.length} linked {item.documents.length === 1 ? "record" : "records"} · {item.role === "reference" ? "Historical reference" : "Active asset"}</small></div><span className={`severity ${item.risk === "High" ? "high" : "low"}`}>{item.risk.toUpperCase()}</span><ArrowRight size={15}/></button>)}</div><div className="registrySummary"><span><b>{assets.filter((item)=>item.risk === "High").length}</b> active risk</span><span><b>{assets.filter((item)=>item.role === "reference").length}</b> historical reference</span></div></aside> : <aside className="assetPanel card neutralAsset" id="asset-360"><div className="neutralAssetIcon"><Factory size={24}/></div><p className="eyebrow">ASSET INTELLIGENCE</p><h2>No assets discovered yet</h2><p>PlantMind creates an Asset 360 view only when an equipment identifier and related events are found in uploaded records.</p><div className="discoveryFlow"><span>Documents</span><ArrowRight size={14}/><span>Asset IDs</span><ArrowRight size={14}/><span>Connected history</span></div></aside>}
        </div>

        {selectedAssetRecord && dashboard.documents > 0 && <section className="assetProfile card" id="asset-profile">
          <div className="assetProfileHead"><div className="assetIdentity"><div className="equipmentIcon large">{selectedAssetRecord.role === "reference" ? <History size={21}/> : <Wrench size={21}/>}</div><div><p className="eyebrow">ASSET 360 · EVIDENCE PROFILE</p><h2>{selectedAssetRecord.id}</h2><span>{selectedAssetRecord.equipmentType} · {selectedAssetRecord.role === "reference" ? "Historical reference" : "Active asset"}</span></div></div><div className="profileRisk"><span>{selectedAssetRecord.role === "reference" ? "CLASSIFICATION" : "CURRENT RISK"}</span><b className={`severity ${selectedAssetRecord.risk === "High" ? "high" : "low"}`}>{selectedAssetRecord.risk.toUpperCase()}</b></div><button className="closeProfile" onClick={()=>setSelectedAsset(null)}>Close</button></div>
          {selectedAssetRecord.role === "active" ? <><div className="assetProfileGrid"><section><div className="sectionLabel"><Gauge size={15}/>Safety limits</div><div className="limitGrid"><div><span>Vibration alert / alarm</span><b>{selectedAssetRecord.limits.vibrationAlert?.join("–") || "—"} <small>mm/s RMS</small></b><em>{selectedAssetRecord.limits.vibrationAlarm ? `Alarm above ${selectedAssetRecord.limits.vibrationAlarm}` : "No alarm value found"}</em></div><div><span>Temperature alert / alarm</span><b>{selectedAssetRecord.limits.temperatureAlert?.join("–") || "—"} <small>°C</small></b><em>{selectedAssetRecord.limits.temperatureAlarm ? `Alarm above ${selectedAssetRecord.limits.temperatureAlarm} °C` : "No alarm value found"}</em></div></div></section><section><div className="sectionLabel"><Thermometer size={15}/>Latest extracted readings</div><div className="readingTable"><div className="readingHeader"><span>Signal</span><span>Latest</span><span>Boundary</span><span>Status</span></div><div><b>Vibration</b><span>{selectedAssetRecord.readings.vibration ?? "—"} mm/s</span><span>{selectedAssetRecord.limits.vibrationAlarm ?? "—"}</span><em className="statusOver">{selectedAssetRecord.risk === "High" ? "ALARM" : "NORMAL"}</em></div><div><b>Temperature</b><span>{selectedAssetRecord.readings.temperature ?? "—"} C</span><span>{selectedAssetRecord.limits.temperatureAlarm ?? "—"}</span><em className="statusOver">{selectedAssetRecord.limits.temperatureAlert && selectedAssetRecord.readings.temperature && selectedAssetRecord.readings.temperature >= selectedAssetRecord.limits.temperatureAlert[0] ? "ALERT" : "NORMAL"}</em></div></div></section></div><div className="assetProfileGrid lower"><section><div className="sectionLabel"><FileClock size={15}/>Maintenance evidence</div><div className="incidentLink"><b>{selectedAssetRecord.maintenance.postponed} postponed lubrication cycles</b><p>{selectedAssetRecord.maintenance.lateDays ? `One cycle was completed ${selectedAssetRecord.maintenance.lateDays} days late. ` : ""}{selectedAssetRecord.maintenance.incomplete ? "The latest cycle remained incomplete at the time of the log." : ""}</p><small>Extracted from linked maintenance records</small></div></section><section><div className="sectionLabel"><AlertTriangle size={15}/>Related incident</div><div className="incidentLink"><span className="severity medium">HISTORICAL MATCH</span><b>{selectedAssetRecord.relatedIncidentId || "No related incident discovered"}</b><p>{selectedAssetRecord.relatedIncidentId ? "A related equipment incident provides a comparable failure pattern." : "No incident record was linked from the uploaded corpus."}</p></div></section></div></> : <div className="historicalProfile"><AlertTriangle size={22}/><div><span>RELATED INCIDENT</span><h3>{selectedAssetRecord.equipmentType}</h3><p>{selectedAssetRecord.id} was discovered only in uploaded incident evidence. It is shown as a historical reference, not an active monitored asset.</p></div></div>}
          <div className="linkedDocuments"><div className="sectionLabel"><BookOpen size={15}/>Linked source documents</div><div>{selectedAssetRecord.documents.map(doc=><a key={doc.id} href={doc.sourceUrl} target="_blank" rel="noreferrer"><FileText size={15}/><span>{doc.name}</span><small>Indexed source</small><ExternalLink size={13}/></a>)}</div></div>
        </section>}

        <section className="library card" id="knowledge-library">
          <div className="cardTitle"><div><p className="eyebrow">KNOWLEDGE LIBRARY</p><h2>Indexed plant records</h2></div><span className="libraryCount">{documents.length} documents</span></div>
          {evaluation && dashboard.documents > 0 && <div className="evaluationStrip"><div><span>Retrieval hit@3</span><b>{evaluation.retrievalHitAt3}%</b></div><div><span>Refusal/answer accuracy</span><b>{evaluation.answerStatusAccuracy}%</b></div><div><span>Citation grounding</span><b>{evaluation.citationGroundingRate}%</b></div><small>Measured on {evaluation.cases} benchmark questions</small></div>}
          <div className="documentGrid">{documents.map((item)=><article className="documentCard" key={item.id}><div className="documentIcon"><FileText size={18}/></div><div><b>{item.name}</b><span>{item.pageCount} {item.pageCount === 1 ? "page" : "pages"} · {item.chunkCount} searchable {item.chunkCount === 1 ? "chunk" : "chunks"}</span><small className={`docStatus ${item.status}`}>{item.status}</small></div><div className="documentActions"><a href={`/api/documents/${item.id}/file`} target="_blank" rel="noreferrer" title={`Open ${item.name}`}><ExternalLink size={15}/></a><button onClick={()=>removeDocument(item)} title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`}><Trash2 size={15}/></button></div></article>)}</div>
          {!documents.length && <p className="emptyLibrary">Upload a PDF, CSV, or TXT record to build the plant knowledge library.</p>}
        </section>

      </section>
    </main>
  );
}

function AnswerWithMarkers({ text, citationCount }: { text: string; citationCount: number }) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return <p>{sentences.map((sentence, index) => <span key={`${sentence}-${index}`}>{sentence.trim()} {citationCount > 0 && <sup className="inlineCitation">{Math.min(index + 1, citationCount)}</sup>}{" "}</span>)}</p>;
}

function RetrievalStrength({ score, basis }: { score: number; basis: string }) {
  const bounded = Math.max(0, Math.min(100, score));
  const label = bounded >= 55 ? "Strong match" : bounded >= 25 ? "Moderate match" : "Limited match";
  return <div className="retrievalStrength"><div><ShieldCheck size={16}/><span><b>Retrieval strength</b><small>{label} · top passage similarity</small></span><strong>{bounded}%</strong></div><div className="strengthTrack"><i style={{width:`${bounded}%`}}/></div><p>{basis} This score comes from document-retrieval similarity, not LLM self-confidence.</p></div>;
}

function citationLabel(citation: Citation) {
  const value = `${citation.document} ${citation.type}`.toLowerCase();
  if (value.includes("manual")) return "OEM manual";
  if (value.includes("inspection")) return "Inspection report";
  if (value.includes("maintenance") || value.includes("work-order") || value.includes("work order") || value.includes("csv")) return "Maintenance log";
  if (value.includes("incident")) return "Incident report";
  return citation.type;
}

function citationIcon(citation: Citation) {
  const label = citationLabel(citation);
  if (label === "Maintenance log") return <FileClock size={17}/>;
  if (label === "Inspection report") return <FileSearch size={17}/>;
  if (label === "Incident report") return <AlertTriangle size={17}/>;
  return <BookOpen size={17}/>;
}

function clipExcerpt(text: string) {
  return text.length > 145 ? `${text.slice(0, 145).trim()}…` : text;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

async function waitForDocument(id: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(`/api/documents/${id}`);
    const document = await response.json();
    if (document.status === "indexed" || document.status === "failed") return document;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Indexing is taking longer than expected. The job will continue in the background.");
}
