import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { BrandingContext } from "../branding.js";

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: { fontSize: 20, fontWeight: "bold", color: "#111827" },
  orgName: { fontSize: 10, color: "#6b7280" },
  banner: {
    backgroundColor: "#fef3c7",
    padding: 6,
    textAlign: "center",
    fontSize: 8,
    color: "#92400e",
    marginBottom: 12,
    borderRadius: 2,
  },
});

interface PageHeaderProps {
  title: string;
  branding: BrandingContext;
}

export function PageHeader({ title, branding }: PageHeaderProps) {
  return (
    <View>
      {branding.confidentialityBanner && (
        <Text style={styles.banner}>{branding.confidentialityBanner}</Text>
      )}
      <View style={styles.header}>
        <Text style={[styles.title, { color: branding.accentColor }]}>{title}</Text>
        <Text style={styles.orgName}>{branding.orgName}</Text>
      </View>
    </View>
  );
}
