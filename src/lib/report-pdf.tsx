// Citation-integrity report as a sober, court-ready PDF — modelled on a counsel's
// opinion / expert report, NOT a SaaS dashboard export. The product earns trust
// from people who distrust AI, so the document is deliberately restrained:
// serif body for legal gravitas, ink on white, verdict colour used only as a
// thin margin rule and a small-caps label (never as a decorative fill), and the
// deterministic method + audit hash placed up front as the credibility anchor.
//
// Built with @react-pdf/renderer using base-14 fonts only (Times / Helvetica /
// Courier) so nothing is fetched at export time. Loaded lazily from the results
// view. Vector output: selectable text, real pagination.

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
  ink: "#1a1d1e",
  text: "#2b2e29",
  muted: "#5e635b",
  faint: "#8b9086",
  rule: "#d2d5cb",
  fab: "#8f1717", // deep red
  mis: "#7a4a06", // deep ochre
  ver: "#1f4f30", // deep green
};

const VERDICT = {
  FABRICATED: { color: C.fab, label: "Fabricated", section: "Authorities not found in the corpus" },
  MISAPPLIED: { color: C.mis, label: "Misapplied", section: "Authorities cited for the wrong proposition" },
  VERIFIED: { color: C.ver, label: "Verified", section: "Authorities verified" },
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 64,
    paddingHorizontal: 58,
    backgroundColor: "#ffffff",
    fontFamily: "Times-Roman",
    fontSize: 10,
    color: C.text,
    lineHeight: 1.5,
  },

  // Masthead.
  mastHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  wordmark: { fontFamily: "Times-Bold", fontSize: 15, color: C.ink, letterSpacing: 0.3 },
  mastTag: { fontFamily: "Helvetica", fontSize: 7, letterSpacing: 1.6, color: C.muted, textTransform: "uppercase" },
  ruleThin: { height: 0.75, backgroundColor: C.rule, marginTop: 7 },
  ruleStrong: { height: 1.2, backgroundColor: C.ink },

  title: { fontFamily: "Times-Bold", fontSize: 20, color: C.ink, marginTop: 16, marginBottom: 14 },

  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: {
    width: 96,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1.1,
    color: C.muted,
    textTransform: "uppercase",
    paddingTop: 1.5,
  },
  metaValue: { flex: 1, fontFamily: "Times-Roman", fontSize: 9.5, color: C.text },
  metaMono: { flex: 1, fontFamily: "Courier", fontSize: 8.5, color: C.text },
  metaMethod: { flex: 1, fontFamily: "Times-Italic", fontSize: 9.5, color: C.text },

  mastClose: { height: 1.2, backgroundColor: C.ink, marginTop: 14, marginBottom: 18 },

  // Block label (SUMMARY, NOTICE).
  blockLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1.6,
    color: C.ink,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  lead: { fontFamily: "Times-Roman", fontSize: 10, color: C.text, lineHeight: 1.55, marginBottom: 12 },

  // Tally.
  tallyRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 7 },
  tallyBar: { width: 2, alignSelf: "stretch", marginRight: 10 },
  tallyCount: { fontFamily: "Times-Bold", fontSize: 11, color: C.ink, width: 16 },
  tallyVerdict: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    width: 70,
    paddingTop: 2,
  },
  tallyMeaning: { flex: 1, fontFamily: "Times-Roman", fontSize: 9.5, color: C.muted, paddingTop: 1 },

  // Section header.
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 24,
    marginBottom: 2,
  },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 1.4, color: C.ink, textTransform: "uppercase" },
  sectionCount: { fontFamily: "Helvetica", fontSize: 7.5, letterSpacing: 0.5, color: C.faint, textTransform: "uppercase" },
  sectionRule: { height: 0.75, backgroundColor: C.ink, marginTop: 4, marginBottom: 12 },

  // Finding.
  finding: { flexDirection: "row", marginBottom: 15 },
  findingBar: { width: 1.5, alignSelf: "stretch", marginRight: 14 },
  findingBody: { flex: 1 },
  findingHead: { flexDirection: "row", alignItems: "baseline", marginBottom: 2 },
  findingNum: { fontFamily: "Times-Roman", fontSize: 9, color: C.faint, width: 20 },
  findingCite: { flex: 1, fontFamily: "Times-Bold", fontSize: 10.5, color: C.ink, lineHeight: 1.35 },
  findingVerdict: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginLeft: 20,
    marginBottom: 5,
  },
  findingText: { fontFamily: "Times-Roman", fontSize: 9.5, color: C.text, lineHeight: 1.55, marginLeft: 20 },

  // Labelled analysis rows (misapplied).
  analysisRow: { flexDirection: "row", marginLeft: 20, marginTop: 7 },
  analysisLabel: {
    width: 84,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    letterSpacing: 1,
    color: C.muted,
    textTransform: "uppercase",
    paddingTop: 1.5,
  },
  analysisValue: { flex: 1, fontFamily: "Times-Roman", fontSize: 9, color: C.text, lineHeight: 1.5 },
  analysisValueItalic: { flex: 1, fontFamily: "Times-Italic", fontSize: 9, color: C.text, lineHeight: 1.5 },

  // Suggested-authorities list.
  authBlock: { marginLeft: 20, marginTop: 8 },
  authLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    letterSpacing: 1,
    color: C.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  authItem: { flexDirection: "row", marginBottom: 4 },
  authDash: { width: 12, fontFamily: "Times-Roman", fontSize: 9, color: C.faint },
  authCol: { flex: 1 },
  authCite: { fontFamily: "Times-Bold", fontSize: 9, color: C.ink },
  authProp: { fontFamily: "Times-Roman", fontSize: 8.5, color: C.muted, lineHeight: 1.45, marginTop: 1 },

  // Closing notice.
  notice: { marginTop: 26 },
  noticeText: { fontFamily: "Times-Italic", fontSize: 8.5, color: C.muted, lineHeight: 1.55 },

  // Footer (fixed).
  footerRule: { position: "absolute", bottom: 44, left: 58, right: 58, height: 0.75, backgroundColor: C.rule },
  footerLeft: {
    position: "absolute",
    bottom: 30,
    left: 58,
    fontFamily: "Helvetica",
    fontSize: 7,
    letterSpacing: 0.6,
    color: C.faint,
    textTransform: "uppercase",
  },
  footerRight: {
    position: "absolute",
    bottom: 30,
    right: 58,
    fontFamily: "Helvetica",
    fontSize: 7,
    letterSpacing: 0.6,
    color: C.faint,
    textTransform: "uppercase",
  },
});

function MetaRow({ label, children, variant }: { label: string; children: React.ReactNode; variant?: "mono" | "method" }) {
  const valueStyle = variant === "mono" ? styles.metaMono : variant === "method" ? styles.metaMethod : styles.metaValue;
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={valueStyle}>{children}</Text>
    </View>
  );
}

function TallyRow({ count, verdict, meaning }: { count: number; verdict: keyof typeof VERDICT; meaning: string }) {
  const v = VERDICT[verdict];
  return (
    <View style={styles.tallyRow}>
      <View style={[styles.tallyBar, { backgroundColor: v.color }]} />
      <Text style={styles.tallyCount}>{count}</Text>
      <Text style={[styles.tallyVerdict, { color: v.color }]}>{v.label}</Text>
      <Text style={styles.tallyMeaning}>{meaning}</Text>
    </View>
  );
}

function Finding({ n, c }: { n: number; c: CitationResult }) {
  const v = VERDICT[c.layer1.verdict];
  const isMis = c.layer1.verdict === "MISAPPLIED";
  const amendments = c.holding_analysis?.amendments ?? [];
  const remLabel = c.layer2.verdict === "OVERRULED" ? "Good-law authorities" : "Suggested authorities";

  return (
    <View style={styles.finding} wrap={false}>
      <View style={[styles.findingBar, { backgroundColor: v.color }]} />
      <View style={styles.findingBody}>
        <View style={styles.findingHead}>
          <Text style={styles.findingNum}>{n}.</Text>
          <Text style={styles.findingCite}>{c.raw_text}</Text>
        </View>
        <Text style={[styles.findingVerdict, { color: v.color }]}>{v.label}</Text>
        <Text style={styles.findingText}>{c.layer1.explanation}</Text>

        {isMis && c.layer1.proposition_cited ? (
          <View style={styles.analysisRow}>
            <Text style={styles.analysisLabel}>Cited for</Text>
            <Text style={styles.analysisValue}>{c.layer1.proposition_cited}</Text>
          </View>
        ) : null}
        {isMis && c.layer1.proposition_actual ? (
          <View style={styles.analysisRow}>
            <Text style={styles.analysisLabel}>Authority holds</Text>
            <Text style={styles.analysisValueItalic}>{c.layer1.proposition_actual}</Text>
          </View>
        ) : null}

        {isMis && amendments.length > 0 ? (
          <View style={styles.authBlock}>
            <Text style={styles.authLabel}>{remLabel}</Text>
            {amendments.map((a, i) => (
              <View key={i} style={styles.authItem}>
                <Text style={styles.authDash}>—</Text>
                <View style={styles.authCol}>
                  <Text style={styles.authCite}>{a.citation}</Text>
                  {a.proposition ? <Text style={styles.authProp}>{a.proposition}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Section({
  verdict,
  items,
  startNum,
}: {
  verdict: keyof typeof VERDICT;
  items: CitationResult[];
  startNum: number;
}) {
  if (items.length === 0) return null;
  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{VERDICT[verdict].section}</Text>
        <Text style={styles.sectionCount}>
          {items.length} finding{items.length === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={styles.sectionRule} />
      {items.map((c, i) => (
        <Finding key={i} n={startNum + i} c={c} />
      ))}
    </View>
  );
}

function TraceitReport({ result }: { result: VerifyResult }) {
  const fabricated = result.results.filter((r) => r.layer1.verdict === "FABRICATED");
  const misapplied = result.results.filter((r) => r.layer1.verdict === "MISAPPLIED");
  const verified = result.results.filter((r) => r.layer1.verdict === "VERIFIED");
  const total = result.total_citations || result.results.length;

  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const sha = result.audit_trail_hash ? `sha256:${result.audit_trail_hash}` : "—";
  const ms = result.processing_ms != null ? `${result.processing_ms.toLocaleString("en-GB")} ms` : "—";
  const shortId = result.matter_id.slice(0, 8);

  const parts = [
    verified.length > 0 ? `${verified.length} verified` : null,
    misapplied.length > 0 ? `${misapplied.length} misapplied` : null,
    fabricated.length > 0 ? `${fabricated.length} could not be located in the verified corpus` : null,
  ].filter(Boolean);
  const tallySentence =
    parts.length > 0
      ? `Of ${total} ${total === 1 ? "authority" : "authorities"} examined, ${
          parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]
        }. Findings are set out below in order of severity.`
      : `${total} authorities were examined. Findings are set out below.`;

  return (
    <Document title={`Citation Integrity Report ${shortId}`} author="TraceIt">
      <Page size="A4" style={styles.page}>
        {/* Masthead */}
        <View style={styles.mastHead}>
          <Text style={styles.wordmark}>TraceIt</Text>
          <Text style={styles.mastTag}>Deterministic citation verification</Text>
        </View>
        <View style={styles.ruleThin} />

        <Text style={styles.title}>Citation Integrity Report</Text>

        <MetaRow label="Matter" variant="mono">
          {result.matter_id}
        </MetaRow>
        <MetaRow label="Date">{dateStr}</MetaRow>
        <MetaRow label="Examined">
          {total} {total === 1 ? "authority" : "authorities"}
        </MetaRow>
        <MetaRow label="Audit" variant="mono">
          {sha}
        </MetaRow>
        <MetaRow label="Processing">{ms}</MetaRow>
        <MetaRow label="Method" variant="method">
          Existence verdicts are produced by deterministic lookup against the verified corpus, with no
          language model in the loop; advisory analysis is labelled as such.
        </MetaRow>

        <View style={styles.mastClose} />

        {/* Summary */}
        <Text style={styles.blockLabel}>Summary</Text>
        <Text style={styles.lead}>{tallySentence}</Text>

        <TallyRow count={fabricated.length} verdict="FABRICATED" meaning="Cited but absent from the verified corpus." />
        <TallyRow
          count={misapplied.length}
          verdict="MISAPPLIED"
          meaning="Exists, but cited for a proposition it does not establish."
        />
        <TallyRow count={verified.length} verdict="VERIFIED" meaning="Exists, remains good law, and is correctly applied." />

        {/* Findings, in order of severity */}
        <Section verdict="FABRICATED" items={fabricated} startNum={1} />
        <Section verdict="MISAPPLIED" items={misapplied} startNum={1 + fabricated.length} />
        <Section verdict="VERIFIED" items={verified} startNum={1 + fabricated.length + misapplied.length} />

        {/* Closing notice */}
        <View style={styles.notice} wrap={false}>
          <View style={styles.ruleThin} />
          <Text style={[styles.blockLabel, { marginTop: 12 }]}>Notice</Text>
          <Text style={styles.noticeText}>
            This report is decision support, not legal advice. The existence verdict for each authority
            is deterministic — it reflects the verified corpus and contains no language-model output.
            Application and good-law analysis draw on cited sources and are advisory. The signing
            advocate remains responsible for every authority placed before the court.
          </Text>
        </View>

        {/* Fixed footer */}
        <View fixed style={styles.footerRule} />
        <Text fixed style={styles.footerLeft}>
          TraceIt · Citation Integrity Report
        </Text>
        <Text
          fixed
          style={styles.footerRight}
          render={({ pageNumber, totalPages }) => `${shortId} · Page ${pageNumber} of ${totalPages}`}
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
  a.download = `traceit-citation-report-${result.matter_id.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
