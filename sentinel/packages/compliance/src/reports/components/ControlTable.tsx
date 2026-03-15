import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ControlScore } from "../../types.js";

const styles = StyleSheet.create({
  table: { width: "100%", marginTop: 8 },
  headerRow: { flexDirection: "row", backgroundColor: "#f3f4f6", padding: 6 },
  row: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  codeCol: { width: "20%" },
  scoreCol: { width: "20%", textAlign: "right" },
  countCol: { width: "20%", textAlign: "right" },
  headerText: { fontSize: 8, fontWeight: "bold", color: "#374151" },
  cellText: { fontSize: 8, color: "#4b5563" },
});

interface ControlTableProps {
  controlScores: ControlScore[];
}

export function ControlTable({ controlScores }: ControlTableProps) {
  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.codeCol, styles.headerText]}>Control</Text>
        <Text style={[styles.scoreCol, styles.headerText]}>Score</Text>
        <Text style={[styles.countCol, styles.headerText]}>Passing</Text>
        <Text style={[styles.countCol, styles.headerText]}>Failing</Text>
        <Text style={[styles.countCol, styles.headerText]}>Total</Text>
      </View>
      {controlScores.map((cs) => (
        <View key={cs.controlCode} style={styles.row}>
          <Text style={[styles.codeCol, styles.cellText]}>{cs.controlCode}</Text>
          <Text style={[styles.scoreCol, styles.cellText]}>{Math.round(cs.score * 100)}%</Text>
          <Text style={[styles.countCol, styles.cellText]}>{cs.passing}</Text>
          <Text style={[styles.countCol, styles.cellText]}>{cs.failing}</Text>
          <Text style={[styles.countCol, styles.cellText]}>{cs.total}</Text>
        </View>
      ))}
    </View>
  );
}
