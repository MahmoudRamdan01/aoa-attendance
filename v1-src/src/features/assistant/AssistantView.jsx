import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Menu, MessageSquare, Send, Sparkles, Trash2, Zap, Plus, Square, Pencil, Archive } from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../../lib/supabase";
import { cls } from "../../lib/cls";

const ASSISTANT_FN_URL = `${SUPABASE_URL}/functions/v1/assistant`;
const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      }));

// Stream a chat turn as Server-Sent Events. Calls handlers as events arrive.
// Returns when the stream ends; throws AbortError if the caller aborts (Stop).
async function streamAssistant(body, { signal, onMeta, onDelta, onResult, onDone }) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  const resp = await fetch(ASSISTANT_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok || !resp.body) {
    let msg = "تعذر الوصول للمساعد — حاول تاني.";
    try { const j = await resp.json(); if (j?.reply) msg = j.reply; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let ev = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.startsWith("event: ")) ev = line.slice(7).trim();
      else if (line.startsWith("data: ")) {
        let d; try { d = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev === "meta") onMeta?.(d);
        else if (ev === "delta") onDelta?.(d.text || "");
        else if (ev === "result") onResult?.(d);
        else if (ev === "done") onDone?.(d);
      }
    }
  }
}

// Inline formatting: **bold** → <strong>, `code` → <code>.
function renderInline(text, keyPrefix) {
  const nodes = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] != null) nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>);
    else nodes.push(<code key={`${keyPrefix}-c${i}`}>{match[2]}</code>);
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Lightweight markdown → React (headings, tables, bullet lists, bold). Enough
// for the assistant's replies; avoids pulling in a full markdown dependency.
function renderMarkdown(md) {
  const lines = String(md || "").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;

  const isTableSep = (line) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
  const splitRow = (line) =>
    line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // Table: a `|` header row followed by a separator row.
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div className="chat-table-wrap" key={`t${key++}`}>
          <table>
            <thead>
              <tr>{header.map((h, hi) => <th key={hi}>{renderInline(h, `h${key}-${hi}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{header.map((_, ci) => <td key={ci}>{renderInline(r[ci] ?? "", `d${key}-${ri}-${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Heading.
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(<p className="chat-heading" key={`hd${key++}`}>{renderInline(h[2], `hd${key}`)}</p>);
      i += 1;
      continue;
    }

    // Bullet list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul className="chat-list" key={`ul${key++}`}>
          {items.map((it, ii) => <li key={ii}>{renderInline(it, `li${key}-${ii}`)}</li>)}
        </ul>
      );
      continue;
    }

    // Horizontal rule → skip (used as a visual divider in replies).
    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr${key++}`} />);
      i += 1;
      continue;
    }

    // Blank line.
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Paragraph: gather consecutive plain lines.
    const para = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("|") &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*-{3,}\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p${key++}`}>
        {para.map((pl, pi) => (
          <span key={pi}>
            {renderInline(pl, `p${key}-${pi}`)}
            {pi < para.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  }

  return blocks;
}

// Structured tables come straight from the Edge Function (built from DB rows,
// never from the model) as { title, columns, rows, footer }. Rendered as a real
// HTML table so numbers are always exact and never mangled markdown text.
function renderTables(tables) {
  if (!Array.isArray(tables) || tables.length === 0) return null;
  return tables.map((t, ti) => (
    <div className="chat-table-wrap" key={`st${ti}`}>
      {t.title && <div className="chat-table-title">{t.title}</div>}
      <table>
        <thead>
          <tr>{(t.columns || []).map((c, ci) => <th key={ci}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {(t.rows || []).map((r, ri) => (
            <tr key={ri}>{(t.columns || []).map((_, ci) => <td key={ci}>{r[ci] ?? "—"}</td>)}</tr>
          ))}
        </tbody>
        {Array.isArray(t.footer) && t.footer.length > 0 && (
          <tfoot>
            <tr>{t.footer.map((f, fi) => <td key={fi}>{f}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  ));
}

function AssistantView({ context }) {
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState("dahl");
  const [lastProvider, setLastProvider] = useState(null);
  const [banner, setBanner] = useState("");
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const nearBottomRef = useRef(true);

  const suggestions = useMemo(() => {
    if (role === "owner") {
      return [
        { label: "ملخص المرتبات", direct: "payroll_summary" },
        { label: "حضور النهارده", direct: "day_attendance" },
        { label: "المعلقات المحتاجة قرار", direct: "pending_approvals" },
        { label: "مديونية Air Ocean", direct: "partner_summary" },
      ];
    }
    if (role === "hr") {
      return [
        { label: "حضور النهارده", direct: "day_attendance" },
        { label: "المعلقات المحتاجة قرار", direct: "pending_approvals" },
        { label: "مصروفات الشهر", direct: "expenses" },
        { label: "مديونية Air Ocean", direct: "partner_summary" },
      ];
    }
    return [
      { label: "حضوري النهارده", direct: "my_today" },
      { label: "ملخص حضوري الشهر", direct: "my_month_summary" },
      { label: "استقطاعاتي الشهر ده", direct: "my_deductions" },
      { label: "حالة طلباتي", direct: "my_requests" },
    ];
  }, [role]);

  async function refreshConversations() {
    const { data } = await supabase
      .from("chat_conversations")
      .select("id,title,last_message_at,archived")
      .eq("archived", false)
      .order("last_message_at", { ascending: false })
      .limit(50);
    setConversations(data || []);
  }

  // Load conversation list + (admins) provider list & saved preference.
  useEffect(() => {
    refreshConversations();
    if (isAdmin) {
      supabase.rpc("list_assistant_providers").then(({ data }) => setProviders(data || []));
      supabase.from("assistant_user_prefs").select("provider_key").maybeSingle()
        .then(({ data }) => { if (data?.provider_key) setProvider(data.provider_key); });
    }
  }, [isAdmin]);

  // Smart auto-scroll: only when the user is already near the bottom.
  function onScroll() {
    const el = scrollRef.current;
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }
  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function normalizeMsg(m) {
    const stale = m.role === "assistant" && m.status === "generating" &&
      Date.now() - new Date(m.created_at).getTime() > 120000;
    return {
      role: m.role,
      content: m.content || "",
      tables: m.tables || [],
      actions: m.actions || [],
      proposals: (m.proposals || []).map((p) => ({ ...p, state: p.state || "pending" })),
      stopped: m.status === "stopped",
      failed: m.status === "failed" || stale,
    };
  }

  async function openConversation(id) {
    if (busy) return;
    setActiveId(id); setSidebarOpen(false); setBanner(""); setLoadingConv(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("id,role,content,tables,actions,proposals,status,provider_key,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    setMessages((data || []).slice().reverse().map(normalizeMsg));
    setLoadingConv(false);
    nearBottomRef.current = true;
  }

  function newChat() {
    if (busy) return;
    setActiveId(null); setMessages([]); setBanner(""); setSidebarOpen(false);
  }

  function stop() { abortRef.current?.abort(); }

  async function saveProviderPref(key) {
    setProvider(key);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("assistant_user_prefs")
        .upsert({ user_id: user.id, provider_key: key, updated_at: new Date().toISOString() });
    }
  }

  function patchLast(arr, fn) {
    if (!arr.length) return arr;
    const copy = arr.slice();
    copy[copy.length - 1] = fn(copy[copy.length - 1]);
    return copy;
  }

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput(""); setBanner("");
    const cmid = uuid();
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    const apiMessages = [...history, { role: "user", content: question }];
    // optimistic: show the user's message + an empty streaming assistant bubble
    setMessages((cur) => [...cur, { role: "user", content: question },
      { role: "assistant", content: "", tables: [], actions: [], proposals: [], streaming: true }]);
    setBusy(true);
    nearBottomRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;
    let convThisTurn = activeId;
    try {
      await streamAssistant(
        {
          conversation_id: activeId || undefined,
          client_message_id: cmid,
          messages: apiMessages,
          provider_hint: isAdmin ? provider : undefined,
        },
        {
          signal: ac.signal,
          onMeta: (d) => {
            if (d.conversation_id && !convThisTurn) { convThisTurn = d.conversation_id; setActiveId(d.conversation_id); }
            if (d.provider_used) setLastProvider(d.provider_used);
            if (d.fallback) setBanner("المحلي مش متاح — رجّعناك لـ Dahl.");
          },
          onDelta: (t) => setMessages((cur) => patchLast(cur, (m) => ({ ...m, content: (m.content || "") + t }))),
          onResult: (d) => setMessages((cur) => patchLast(cur, (m) => ({
            ...m, tables: d.tables || [], actions: d.actions || [],
            proposals: (d.proposals || []).map((p) => ({ ...p, state: "pending" })),
          }))),
          onDone: (d) => setMessages((cur) => patchLast(cur, (m) => ({
            ...m, streaming: false, stopped: d.status === "stopped", failed: d.status === "failed",
          }))),
        },
      );
    } catch (e) {
      const stopped = e.name === "AbortError";
      setMessages((cur) => patchLast(cur, (m) => ({
        ...m, streaming: false, stopped, failed: !stopped,
        content: m.content || (stopped ? "" : `❌ ${e.message || "خطأ"}`),
      })));
    } finally {
      setBusy(false); abortRef.current = null;
      refreshConversations();
    }
  }

  // Instant chip: one read tool server-side, no LLM, JSON response.
  async function sendDirect(tool, label) {
    if (busy) return;
    setBanner("");
    const cmid = uuid();
    setMessages((cur) => [...cur, { role: "user", content: label }]);
    setBusy(true);
    nearBottomRef.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(ASSISTANT_FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ direct: { tool }, label, conversation_id: activeId || undefined, client_message_id: cmid }),
      });
      const d = await resp.json();
      if (d.conversation_id && !activeId) setActiveId(d.conversation_id);
      setMessages((cur) => [...cur, { role: "assistant", content: d.reply || "", tables: d.tables || [], actions: d.actions || [], proposals: [] }]);
    } catch (e) {
      setMessages((cur) => [...cur, { role: "assistant", content: `❌ ${e.message || "خطأ"}`, tables: [], actions: [], proposals: [] }]);
    } finally {
      setBusy(false);
      refreshConversations();
    }
  }

  async function confirmProposal(messageIndex, proposalIndex) {
    const proposal = messages[messageIndex]?.proposals?.[proposalIndex];
    if (!proposal || proposal.state !== "pending" || busy) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("assistant", { body: { confirm_action: { name: proposal.name, args: proposal.args } } });
    const failed = !!error || data?.result?.error;
    setMessages((current) => {
      const copy = current.map((m, i) =>
        i === messageIndex
          ? { ...m, proposals: m.proposals.map((p, j) => (j === proposalIndex ? { ...p, state: failed ? "failed" : "done" } : p)) }
          : m);
      return [...copy, {
        role: "assistant",
        content: failed ? `❌ ${data?.result?.message || data?.result?.error || "فشل التنفيذ."}` : `✅ تم التنفيذ: ${data?.summary || proposal.summary}`,
        tables: [], actions: [], proposals: [],
      }];
    });
    setBusy(false);
  }

  function dismissProposal(messageIndex, proposalIndex) {
    setMessages((current) =>
      current.map((m, i) =>
        i === messageIndex
          ? { ...m, proposals: m.proposals.map((p, j) => (j === proposalIndex ? { ...p, state: "dismissed" } : p)) }
          : m));
  }

  async function renameConversation(id, curTitle) {
    const title = prompt("اسم المحادثة:", curTitle || "");
    if (title == null) return;
    await supabase.from("chat_conversations").update({ title: title.slice(0, 80) }).eq("id", id);
    refreshConversations();
  }
  async function archiveConversation(id) {
    await supabase.from("chat_conversations").update({ archived: true }).eq("id", id);
    if (activeId === id) newChat();
    refreshConversations();
  }
  async function deleteConversation(id) {
    if (!confirm("تمسح المحادثة نهائيًا؟")) return;
    await supabase.from("chat_conversations").delete().eq("id", id);
    if (activeId === id) newChat();
    refreshConversations();
  }

  const providerLabel = (key) => ({ dahl: "Dahl Cloud", ollama: "Qwen Local" }[key] || "");

  return (
    <section className="panel chat-panel">
      <div className="chat-layout">
        <aside className={cls("chat-sidebar", sidebarOpen && "open")}>
          <button className="chat-new" onClick={newChat}><Plus size={16} /> محادثة جديدة</button>
          <div className="chat-conv-list">
            {conversations.length === 0 && <p className="chat-conv-empty">مفيش محادثات لسه</p>}
            {conversations.map((c) => (
              <div key={c.id} className={cls("chat-conv", activeId === c.id && "active")}>
                <button className="chat-conv-open" onClick={() => openConversation(c.id)} title={c.title || "محادثة"}>
                  <MessageSquare size={14} /> <span>{c.title || "محادثة"}</span>
                </button>
                <div className="chat-conv-actions">
                  <button title="إعادة تسمية" onClick={() => renameConversation(c.id, c.title)}><Pencil size={13} /></button>
                  <button title="أرشفة" onClick={() => archiveConversation(c.id)}><Archive size={13} /></button>
                  <button title="حذف" onClick={() => deleteConversation(c.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {sidebarOpen && <div className="chat-scrim" onClick={() => setSidebarOpen(false)} />}

        <div className="chat-main">
          <div className="panel-title between chat-header">
            <div>
              <button className="chat-menu-btn" onClick={() => setSidebarOpen((o) => !o)} title="المحادثات"><Menu size={18} /></button>
              <Sparkles size={20} /><h2>المساعد الذكي</h2>
            </div>
            <div className="toolbar chat-header-tools">
              {isAdmin && providers.length > 1 && (
                <select className="chat-provider" value={provider} onChange={(e) => saveProviderPref(e.target.value)} disabled={busy} title="اختيار الموديل">
                  {providers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              )}
              {isAdmin && lastProvider && <span className="chat-provider-badge">{providerLabel(lastProvider)}</span>}
            </div>
          </div>

          {banner && <div className="chat-banner">{banner}</div>}

          <div className="chat-messages" ref={scrollRef} onScroll={onScroll}>
            {loadingConv && <div className="chat-loading">بحمّل المحادثة…</div>}
            {!loadingConv && messages.length === 0 && (
              <div className="chat-empty">
                <Sparkles size={34} />
                <p>اسألني عن أي حاجة في السيستم — بجاوب من البيانات الحقيقية وأقدر أنفذ عمليات.</p>
                <div className="chat-suggestions">
                  {suggestions.map((s) => (
                    <button key={s.label} type="button" onClick={() => (s.direct ? sendDirect(s.direct, s.label) : send(s.label))}>
                      <Zap size={13} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cls("chat-bubble", m.role)}>
                <div className="chat-content">
                  {m.role === "assistant"
                    ? (m.content ? renderMarkdown(m.content)
                      : (m.streaming ? <div className="chat-typing"><span /><span /><span /></div> : null))
                    : m.content}
                </div>
                {m.role === "assistant" && renderTables(m.tables)}
                {m.stopped && <span className="chat-note">⏹ اتوقف</span>}
                {m.actions?.length > 0 && (
                  <div className="chat-chips">
                    {m.actions.map((a, j) => (
                      <span key={j} className={cls("chat-chip", a.ok === false && "failed")}>
                        {a.ok === false ? "✗" : "✓"} {a.name}
                      </span>
                    ))}
                  </div>
                )}
                {m.proposals?.map((p, j) => (
                  <div key={j} className={cls("chat-proposal", p.state)}>
                    <p><AlertTriangle size={15} /> {p.summary}</p>
                    {p.state === "pending" && (
                      <div className="actions-row">
                        <button className="primary" disabled={busy} onClick={() => confirmProposal(i, j)}>تنفيذ</button>
                        <button className="secondary" onClick={() => dismissProposal(i, j)}>تجاهل</button>
                      </div>
                    )}
                    {p.state === "done" && <span className="status-badge confirmed">تم التنفيذ</span>}
                    {p.state === "failed" && <span className="status-badge rejected">فشل</span>}
                    {p.state === "dismissed" && <span className="status-badge voided">اتجاهلت</span>}
                  </div>
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب سؤالك أو طلبك..." />
            {busy ? (
              <button type="button" className="danger chat-stop" onClick={stop} title="إيقاف"><Square size={16} /></button>
            ) : (
              <button className="primary" disabled={!input.trim()} type="submit"><Send size={17} /></button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

// ===================== Financial modules =====================

export default AssistantView;
