// Branded, vector PDF export for a citation-integrity report. Rendered with
// @react-pdf/renderer (selectable text, real pagination, fixed page footer).
// Loaded lazily from the results view so it never weighs on the main bundle.
// Light, print-oriented palette — a report is always a clean white document.

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { CitationResult, VerifyResult } from "./types";

const C = {
  ink: "#14181a",
  lime: "#c6f035",
  paper: "#f6f7f2",
  n300: "#d7dbcf",
  n500: "#6e726a",
  n700: "#2e322c",
  track: "#ecefe6",
  good: "#166534",
  goodBg: "#eef6f0",
  goodBd: "#cfe6d8",
  warn: "#92400e",
  warnBg: "#fbf4e8",
  warnBd: "#ecd6b2",
  bad: "#b91c1c",
  badBg: "#fbeeee",
  badBd: "#ecc4c4",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: 56,
    paddingHorizontal: 42,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: C.n700,
    backgroundColor: "#ffffff",
    lineHeight: 1.5,
  },
  // Header band — bleeds to the page edges on the first page.
  band: {
    backgroundColor: C.ink,
    marginTop: -38,
    marginHorizontal: -42,
    marginBottom: 22,
    paddingVertical: 22,
    paddingHorizontal: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  wordmarkRow: { flexDirection: "row", alignItems: "baseline" },
  wordmark: { fontFamily: "Helvetica-Bold", fontSize: 21, color: "#ffffff" },
  wordmarkIt: { fontFamily: "Helvetica-Bold", fontSize: 21, color: C.lime },
  headerSub: {
    marginTop: 5,
    fontSize: 7.5,
    letterSpacing: 2,
    color: "#9aa097",
    fontFamily: "Helvetica-Bold",
  },
  headerMetaWrap: { alignItems: "flex-end" },
  headerId: { fontFamily: "Courier", fontSize: 9, color: "#cfd3c9" },
  headerDate: { marginTop: 4, fontSize: 8.5, color: "#9aa097" },

  // Citation health card.
  healthCard: {
    backgroundColor: C.paper,
    borderRadius: 10,
    border: `1px solid ${C.n300}`,
    padding: 16,
    marginBottom: 8,
  },
  kicker: {
    fontSize: 8,
    letterSpacing: 2,
    color: C.n500,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.track,
    overflow: "hidden",
    flexDirection: "row",
    marginBottom: 11,
  },
  countsRow: { flexDirection: "row", alignItems: "center" },
  count: { flexDirection: "row", alignItems: "center", marginRight: 22 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  countN: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.ink, marginRight: 4 },
  countLabel: { fontSize: 9, color: C.n500 },
  healthDivider: { height: 1, backgroundColor: C.n300, marginVertical: 12 },
  healthFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mono: { fontFamily: "Courier", fontSize: 8, color: C.n500 },

  // Section header pill.
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 1.4 },
  sectionCount: { fontSize: 8, color: C.n500 },

  // Citation cards.
  card: { borderRadius: 8, padding: 13, marginBottom: 10, border: `1px solid ${C.n300}` },
  cardTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 5 },
  body: { fontSize: 9.5, color: C.n700, lineHeight: 1.55 },

  label: {
    marginTop: 10,
    marginBottom: 3,
    fontSize: 7.5,
    letterSpacing: 1.2,
    color: C.n500,
    fontFamily: "Helvetica-Bold",
  },
  quote: { borderLeft: `2px solid ${C.n300}`, paddingLeft: 8, fontSize: 9, color: C.n700, lineHeight: 1.5 },
  amend: { marginTop: 6 },
  amendCite: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: C.ink },
  amendProp: { marginTop: 1, fontSize: 8.5, color: C.n500, lineHeight: 1.45 },

  // Fixed page footer.
  footerLine: { position: "absolute", bottom: 40, left: 42, right: 42, height: 1, backgroundColor: C.n300 },
  footerLeft: { position: "absolute", bottom: 26, left: 42, fontFamily: "Courier", fontSize: 7.5, color: C.n500 },
  footerRight: { position: "absolute", bottom: 26, right: 42, fontFamily: "Courier", fontSize: 7.5, color: C.n500 },
});

const TONE = {
  bad: { text: C.bad, bg: C.badBg, bd: C.badBd },
  warn: { text: C.warn, bg: C.warnBg, bd: C.warnBd },
  good: { text: C.good, bg: C.goodBg, bd: C.goodBd },
} as const;

function SectionHead({ tone, title, count }: { tone: keyof typeof TONE; title: string; count: number }) {
  const t = TONE[tone];
  return (
    <View style={[styles.sectionHead, { backgroundColor: t.bg, border: `1px solid ${t.bd}` }]}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
      <Text style={styles.sectionCount}>
        {count} citation{count === 1 ? "" : "s"}
      </Text>
    </View>
  );
}

function FabricatedCard({ c }: { c: CitationResult }) {
  return (
    <View wrap={false} style={[styles.card, { backgroundColor: C.badBg, border: `1px solid ${C.badBd}` }]}>
      <Text style={[styles.cardTitle, { color: C.bad }]}>{c.raw_text}</Text>
      <Text style={styles.body}>{c.layer1.explanation}</Text>
    </View>
  );
}

function MisappliedCard({ c }: { c: CitationResult }) {
  const amendments = c.holding_analysis?.amendments ?? [];
  const remLabel = c.layer2.verdict === "OVERRULED" ? "GOOD LAW ALTERNATIVES" : "SUGGESTED REMEDIATION";
  return (
    <View wrap={false} style={[styles.card, { backgroundColor: C.warnBg, border: `1px solid ${C.warnBd}` }]}>
      <Text style={[styles.cardTitle, { color: C.warn }]}>{c.raw_text}</Text>
      <Text style={styles.body}>{c.layer1.explanation}</Text>

      {c.layer1.proposition_cited && (
        <>
          <Text style={styles.label}>CITED FOR</Text>
          <Text style={styles.quote}>{c.layer1.proposition_cited}</Text>
        </>
      )}
      {c.layer1.proposition_actual && (
        <>
          <Text style={styles.label}>ACTUALLY ESTABLISHES</Text>
          <Text style={[styles.quote, { borderLeft: `2px solid ${C.good}` }]}>
            {c.layer1.proposition_actual}
          </Text>
        </>
      )}
      {amendments.length > 0 && (
        <>
          <Text style={styles.label}>{remLabel}</Text>
          {amendments.map((a, i) => (
            <View key={i} style={styles.amend}>
              <Text style={styles.amendCite}>› {a.citation}</Text>
              {a.proposition ? <Text style={styles.amendProp}>{a.proposition}</Text> : null}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function VerifiedCard({ c }: { c: CitationResult }) {
  return (
    <View wrap={false} style={[styles.card, { backgroundColor: C.goodBg, border: `1px solid ${C.goodBd}` }]}>
      <Text style={[styles.cardTitle, { color: C.good }]}>{c.raw_text}</Text>
      <Text style={styles.body}>{c.layer1.explanation}</Text>
    </View>
  );
}

function TraceitReport({ result }: { result: VerifyResult }) {
  const fabricated = result.results.filter((r) => r.layer1.verdict === "FABRICATED");
  const misapplied = result.results.filter((r) => r.layer1.verdict === "MISAPPLIED");
  const verified = result.results.filter((r) => r.layer1.verdict === "VERIFIED");

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const shortId = `${result.matter_id.slice(0, 8)}…`;
  const sha = result.audit_trail_hash ? `sha256:${result.audit_trail_hash.slice(0, 40)}…` : "";
  const ms = `${(result.processing_ms ?? 0).toLocaleString("en-GB")} ms`;

  return (
    <Document title={`TraceIt report ${shortId}`} author="TraceIt">
      <Page size="A4" style={styles.page}>
        {/* Header band (first page only) */}
        <View style={styles.band}>
          <View>
            <View style={styles.wordmarkRow}>
              <Text style={styles.wordmark}>Trace</Text>
              <Text style={styles.wordmarkIt}>IT</Text>
            </View>
            <Text style={styles.headerSub}>CITATION INTEGRITY REPORT</Text>
          </View>
          <View style={styles.headerMetaWrap}>
            <Text style={styles.headerId}>{shortId}</Text>
            <Text style={styles.headerDate}>{dateStr}</Text>
          </View>
        </View>

        {/* Citation health */}
        <View style={styles.healthCard}>
          <Text style={styles.kicker}>CITATION HEALTH</Text>
          <View style={styles.bar}>
            {verified.length > 0 && <View style={{ flexGrow: verified.length, backgroundColor: C.good }} />}
            {misapplied.length > 0 && <View style={{ flexGrow: misapplied.length, backgroundColor: C.warn }} />}
            {fabricated.length > 0 && <View style={{ flexGrow: fabricated.length, backgroundColor: C.bad }} />}
          </View>
          <View style={styles.countsRow}>
            <View style={styles.count}>
              <View style={[styles.dot, { backgroundColor: C.good }]} />
              <Text style={styles.countN}>{verified.length}</Text>
              <Text style={styles.countLabel}>verified</Text>
            </View>
            <View style={styles.count}>
              <View style={[styles.dot, { backgroundColor: C.warn }]} />
              <Text style={styles.countN}>{misapplied.length}</Text>
              <Text style={styles.countLabel}>misapplied</Text>
            </View>
            <View style={styles.count}>
              <View style={[styles.dot, { backgroundColor: C.bad }]} />
              <Text style={styles.countN}>{fabricated.length}</Text>
              <Text style={styles.countLabel}>fabricated</Text>
            </View>
          </View>
          <View style={styles.healthDivider} />
          <View style={styles.healthFooter}>
            <Text style={styles.mono}>{sha}</Text>
            <Text style={styles.mono}>{ms}</Text>
          </View>
        </View>

        {fabricated.length > 0 && (
          <>
            <SectionHead tone="bad" title="NON-EXISTENT CITATIONS" count={fabricated.length} />
            {fabricated.map((c, i) => (
              <FabricatedCard key={i} c={c} />
            ))}
          </>
        )}

        {misapplied.length > 0 && (
          <>
            <SectionHead tone="warn" title="MISAPPLIED CITATIONS" count={misapplied.length} />
            {misapplied.map((c, i) => (
              <MisappliedCard key={i} c={c} />
            ))}
          </>
        )}

        {verified.length > 0 && (
          <>
            <SectionHead tone="good" title="VERIFIED CITATIONS" count={verified.length} />
            {verified.map((c, i) => (
              <VerifiedCard key={i} c={c} />
            ))}
          </>
        )}

        {/* Fixed footer on every page */}
        <View fixed style={styles.footerLine} />
        <Text fixed style={styles.footerLeft}>
          TraceIt · {result.matter_id}
        </Text>
        <Text
          fixed
          style={styles.footerRight}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function downloadReportPdf(result: VerifyResult): Promise<void> {
  const blob = await pdf(<TraceitReport result={result} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `traceit-${result.matter_id.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
