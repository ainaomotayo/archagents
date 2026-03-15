import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { BrandingContext } from "../branding.js";

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9ca3af",
  },
});

interface PageFooterProps {
  branding: BrandingContext;
  generatedAt: string;
}

export function PageFooter({ branding, generatedAt }: PageFooterProps) {
  return (
    <View style={styles.footer}>
      <Text>{branding.footerText}</Text>
      <Text>{generatedAt}</Text>
    </View>
  );
}
