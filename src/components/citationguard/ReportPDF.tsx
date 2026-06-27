import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { VerifyResult, CitationResult } from "@/lib/types";

// ─── Colour tokens (light mode) ──────────────────────────────────────────────
const C = {
  ink:      "#14181a",
  limeDark: "#a3d335",
  n100:     "#ecefe6",
  n200:     "#e2e6db",
  n300:     "#d7dbcf",
  n500:     "#6e726a",
  n700:     "#2e322c",
  good:     "#166534", goodBg: "#e7f4ec", goodBd: "#a6d8b9",
  warn:     "#92400e", warnBg: "#fbf1e3", warnBd: "#e6c496",
  bad:      "#b91c1c", badBg:  "#fbeaea", badBd:  "#e3a6a6",
};

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    paddingBottom: 52,
  },

  // Hero header — page 1 only (not fixed)
  hero: {
    backgroundColor: C.ink,
    paddingHorizontal: 40,
    paddingTop: 30,
    paddingBottom: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  heroLogoRow: { flexDirection: "row", alignItems: "baseline" },
  heroLogoA:   { color: "#ffffff",   fontFamily: "Helvetica-Bold", fontSize: 26 },
  heroLogoB:   { color: C.limeDark, fontFamily: "Helvetica-Bold", fontSize: 26 },
  heroSub:     { color: "#9aa097", fontSize: 7.5, letterSpacing: 2.5, marginTop: 5 },
  heroRight:   { alignItems: "flex-end" },
  heroMatter:  { color: "#d0d4cc", fontSize: 8.5, fontFamily: "Courier" },
  heroDate:    { color: "#9aa097", fontSize: 8.5, marginTop: 3 },


  // Summary card
  summaryWrap: {
    marginHorizontal: 36,
    marginTop: 22,
    backgroundColor: C.n100,
    borderRadius: 8,
    padding: 18,
  },
  summaryHeading: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.n500,
    letterSpacing: 2.5,
    marginBottom: 14,
  },
  bar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 14,
  },
  statsRow: { flexDirection: "row" },
  statItem:  { flex: 1, flexDirection: "row", alignItems: "center" },
  statDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statNum:   { fontFamily: "Helvetica-Bold", fontSize: 15, marginRight: 4 },
  statLabel: { fontSize: 8.5, color: C.n500 },
  metaDivider: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.n300,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaText: { fontSize: 7.5, color: C.n500, fontFamily: "Courier" },

  // Section
  section:      { marginHorizontal: 36, marginTop: 22 },
  sectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  sectionLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 2, flex: 1 },
  sectionCount: { fontSize: 7.5 },

  // Citation card
  card: {
    borderRadius: 6,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  cardTitle:       { fontFamily: "Helvetica-Bold", fontSize: 10.5, lineHeight: 1.35, marginBottom: 5 },
  cardExplanation: { fontSize: 9, lineHeight: 1.65, color: C.n700 },
  subLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    marginTop: 10,
    marginBottom: 4,
  },
  propBar: { borderLeftWidth: 2, paddingLeft: 7, marginBottom: 4 },
  propText: { fontSize: 9, lineHeight: 1.55, color: C.n700 },

  // Amendments
  amendHeader: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: C.n500,
    marginTop: 10,
    marginBottom: 4,
  },
  amendRow:      { flexDirection: "row", marginTop: 4 },
  amendArrow:    { fontSize: 9, fontFamily: "Helvetica-Bold", marginRight: 6, marginTop: 1 },
  amendBody:     { flex: 1 },
  amendCitation: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.n700, lineHeight: 1.35 },
  amendProp:     { fontSize: 8.5, color: C.n500, lineHeight: 1.45, marginTop: 1.5 },

  // Fixed footer
  footer: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 36,
    paddingVertical: 11,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.n200,
  },
  footerLeft:  { fontSize: 7, color: C.n500, fontFamily: "Courier" },
  footerRight: { fontSize: 7, color: C.n500 },
});

// ─── Citation card ────────────────────────────────────────────────────────────
function CitationCard({ r, accent, bg, bd }: {
  r: CitationResult; accent: string; bg: string; bd: string;
}) {
  const ha = r.holding_analysis;
  const v1 = r.layer1;

  return (
    <View style={[s.card, { backgroundColor: bg, borderColor: bd }]} wrap={false}>
      <Text style={[s.cardTitle, { color: accent }]}>{r.raw_text}</Text>
      <Text style={s.cardExplanation}>{v1.explanation}</Text>

      {v1.proposition_cited && <>
        <Text style={[s.subLabel, { color: C.warn }]}>CITED FOR</Text>
        <View style={[s.propBar, { borderLeftColor: C.warn }]}>
          <Text style={s.propText}>{v1.proposition_cited}</Text>
        </View>
      </>}

      {v1.proposition_actual && <>
        <Text style={[s.subLabel, { color: C.good }]}>ACTUALLY ESTABLISHES</Text>
        <View style={[s.propBar, { borderLeftColor: C.good }]}>
          <Text style={s.propText}>{v1.proposition_actual}</Text>
        </View>
      </>}

      {ha?.amendments && ha.amendments.length > 0 && <>
        <Text style={s.amendHeader}>
          {v1.verdict === "FABRICATED"
            ? "ALTERNATIVE AUTHORITIES"
            : r.layer2.verdict === "OVERRULED"
              ? "GOOD LAW ALTERNATIVES"
              : "SUGGESTED REMEDIATION"}
        </Text>
        {ha.amendments.map((a, i) => (
          <View key={i} style={s.amendRow}>
            <Text style={[s.amendArrow, { color: accent }]}>{"→"}</Text>
            <View style={s.amendBody}>
              <Text style={s.amendCitation}>{a.citation}</Text>
              {a.proposition ? <Text style={s.amendProp}>{a.proposition}</Text> : null}
            </View>
          </View>
        ))}
      </>}
    </View>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────
function SectionBlock({ citations, label, icon, accent, bg, bd }: {
  citations: CitationResult[]; label: string; icon: string;
  accent: string; bg: string; bd: string;
}) {
  if (citations.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={[s.sectionBanner, { backgroundColor: bg, borderColor: bd }]}>
        <Text style={[s.sectionLabel, { color: accent }]}>
          {icon}{"  "}{label.toUpperCase()}
        </Text>
        <Text style={[s.sectionCount, { color: accent }]}>
          {citations.length} {citations.length === 1 ? "citation" : "citations"}
        </Text>
      </View>
      {citations.map((r, i) => (
        <CitationCard key={i} r={r} accent={accent} bg={bg} bd={bd} />
      ))}
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────
export function ReportDocument({
  result, generatedAt,
}: { result: VerifyResult; generatedAt: string }) {
  const fabricated = result.results.filter(r => r.layer1.verdict === "FABRICATED");
  const misapplied = result.results.filter(r => r.layer1.verdict === "MISAPPLIED");
  const verified   = result.results.filter(r => r.layer1.verdict === "VERIFIED");
  const total      = result.total_citations || 1;

  const pctV = (verified.length   / total) * 100;
  const pctM = (misapplied.length / total) * 100;
  const pctF = (fabricated.length / total) * 100;

  return (
    <Document
      title={`TraceIT Report · ${result.matter_id.slice(0, 8)}`}
      author="TraceIT"
      subject="Citation Integrity Report"
      creator="TraceIT"
    >
      <Page size="A4" style={s.page}>

        {/* ── Hero header (page 1 only, not fixed) ── */}
        <View style={s.hero}>
          <View>
            <View style={s.heroLogoRow}>
              <Text style={s.heroLogoA}>Trace</Text>
              <Text style={s.heroLogoB}>IT</Text>
            </View>
            <Text style={s.heroSub}>CITATION INTEGRITY REPORT</Text>
          </View>
          <View style={s.heroRight}>
            <Text style={s.heroMatter}>{result.matter_id.slice(0, 8)}…</Text>
            <Text style={s.heroDate}>{generatedAt}</Text>
          </View>
        </View>

        {/* ── Summary ── */}
        <View style={s.summaryWrap}>
          <Text style={s.summaryHeading}>CITATION HEALTH</Text>

          <View style={s.bar}>
            <View style={{ width: `${pctV}%`, backgroundColor: C.good }} />
            <View style={{ width: `${pctM}%`, backgroundColor: C.warn }} />
            <View style={{ width: `${pctF}%`, backgroundColor: C.bad  }} />
          </View>

          <View style={s.statsRow}>
            <View style={s.statItem}>
              <View style={[s.statDot, { backgroundColor: C.good }]} />
              <Text style={[s.statNum, { color: C.good }]}>{verified.length}</Text>
              <Text style={s.statLabel}>verified</Text>
            </View>
            {misapplied.length > 0 && (
              <View style={s.statItem}>
                <View style={[s.statDot, { backgroundColor: C.warn }]} />
                <Text style={[s.statNum, { color: C.warn }]}>{misapplied.length}</Text>
                <Text style={s.statLabel}>misapplied</Text>
              </View>
            )}
            {fabricated.length > 0 && (
              <View style={s.statItem}>
                <View style={[s.statDot, { backgroundColor: C.bad }]} />
                <Text style={[s.statNum, { color: C.bad }]}>{fabricated.length}</Text>
                <Text style={s.statLabel}>fabricated</Text>
              </View>
            )}
          </View>

          <View style={s.metaDivider}>
            <Text style={s.metaText}>
              sha256:{result.audit_trail_hash.slice(0, 40)}…
            </Text>
            <Text style={s.metaText}>
              {result.processing_ms.toLocaleString()} ms
            </Text>
          </View>
        </View>

        {/* ── Citation sections ── */}
        <SectionBlock
          citations={fabricated}
          label="Non-existent citations"
          icon="✕"
          accent={C.bad}  bg={C.badBg}  bd={C.badBd}
        />
        <SectionBlock
          citations={misapplied}
          label="Misapplied citations"
          icon="▲"
          accent={C.warn} bg={C.warnBg} bd={C.warnBd}
        />
        <SectionBlock
          citations={verified}
          label="Verified citations"
          icon="✓"
          accent={C.good} bg={C.goodBg} bd={C.goodBd}
        />

        {/* ── Fixed footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerLeft}>
            TraceIT · {result.matter_id}
          </Text>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  );
}
