import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 4, color: "#111827" },
  subtitle: { fontSize: 12, color: "#6b7280", marginBottom: 20 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 8, color: "#1f2937" },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 200, fontWeight: "bold" },
  value: { flex: 1 },
  table: { marginTop: 8 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
  tableHeader: { fontWeight: "bold", backgroundColor: "#f9fafb" },
  col1: { width: 70 },
  col2: { flex: 1 },
  col3: { width: 60 },
  col4: { width: 100 },
  col5: { width: 80 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#9ca3af" },
});

function scoreColor(score: number): string {
  if (score >= 0.8) return "#22c55e";
  if (score >= 0.5) return "#eab308";
  return "#ef4444";
}

export interface HipaaAssessmentData {
  orgName: string;
  generatedAt: string;
  frameworkVersion: string;
  overallScore: number;
  safeguardScores: Array<{ safeguard: string; score: number; specCount: number }>;
  gaps: Array<{ controlCode: string; controlName: string; severity: string; gapType: string; regulatoryStatus?: string }>;
  attestationSummary: { total: number; attested: number; expired: number; unattested: number };
  baaCount: number;
}

export function HipaaAssessmentReport({ data }: { data: HipaaAssessmentData }) {
  const { orgName, generatedAt, frameworkVersion, overallScore, safeguardScores, gaps, attestationSummary, baaCount } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>HIPAA Security Rule Assessment</Text>
        <Text style={styles.subtitle}>{orgName} — HIPAA {frameworkVersion}</Text>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Organization:</Text>
            <Text style={styles.value}>{orgName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Generated:</Text>
            <Text style={styles.value}>{generatedAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Regulation Version:</Text>
            <Text style={styles.value}>{frameworkVersion}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Overall Score:</Text>
            <Text style={{ color: scoreColor(overallScore) }}>
              {(overallScore * 100).toFixed(1)}%
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Active BAAs:</Text>
            <Text style={styles.value}>{baaCount}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safeguard Scores</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.col2}>Safeguard</Text>
              <Text style={styles.col3}>Score</Text>
              <Text style={styles.col3}>Specs</Text>
            </View>
            {safeguardScores.map((s, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.col2}>{s.safeguard}</Text>
                <Text style={{ ...styles.col3, color: scoreColor(s.score) }}>
                  {(s.score * 100).toFixed(1)}%
                </Text>
                <Text style={styles.col3}>{s.specCount}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gap Analysis</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.col1}>Control</Text>
              <Text style={styles.col2}>Name</Text>
              <Text style={styles.col3}>Severity</Text>
              <Text style={styles.col4}>Gap Type</Text>
              <Text style={styles.col5}>Status</Text>
            </View>
            {gaps.map((g, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.col1}>{g.controlCode}</Text>
                <Text style={styles.col2}>{g.controlName}</Text>
                <Text style={styles.col3}>{g.severity}</Text>
                <Text style={styles.col4}>{g.gapType.replace(/_/g, " ")}</Text>
                <Text style={styles.col5}>{g.regulatoryStatus ?? "required"}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attestation Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Total Controls:</Text>
            <Text style={styles.value}>{attestationSummary.total}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Attested:</Text>
            <Text style={styles.value}>{attestationSummary.attested}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Expired:</Text>
            <Text style={styles.value}>{attestationSummary.expired}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Unattested:</Text>
            <Text style={styles.value}>{attestationSummary.unattested}</Text>
          </View>
        </View>

        <Text style={styles.footer}>Generated by SENTINEL on {generatedAt} | HIPAA {frameworkVersion} | Confidential</Text>
      </Page>
    </Document>
  );
}
