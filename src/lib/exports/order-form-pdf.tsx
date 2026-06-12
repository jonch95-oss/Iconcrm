import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { OrderFormExportData } from "./order-form";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica" },
  company: { fontSize: 16, fontWeight: "bold", marginBottom: 2 },
  sub: { fontSize: 11, fontWeight: "bold", marginBottom: 8 },
  meta: { fontSize: 9, marginBottom: 2, color: "#333" },
  table: { marginTop: 12, borderTop: "1pt solid #ccc" },
  row: { flexDirection: "row", borderBottom: "1pt solid #eee" },
  headerRow: { flexDirection: "row", backgroundColor: "#eee", borderBottom: "1pt solid #ccc" },
  cell: { padding: 4, borderRight: "1pt solid #eee" },
  cellText: { fontSize: 8 },
  headerText: { fontSize: 8, fontWeight: "bold" },
});

function OrderFormPdf({ data }: { data: OrderFormExportData }) {
  const sizeWidth = `${Math.max(6, 40 / Math.max(1, data.sizes.length))}%`;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.company}>Wholesale Co. — Sample-to-PO</Text>
        <Text style={styles.sub}>Order Form {data.orderFormNumber}</Text>
        <Text style={styles.meta}>
          Factory: {data.factory.name}
          {data.factory.country ? ` (${data.factory.country})` : ""}
        </Text>
        <Text style={styles.meta}>
          Contact: {data.factory.contactName ?? "—"} {data.factory.contactEmail ?? ""}
        </Text>

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <View style={[styles.cell, { width: "14%" }]}><Text style={styles.headerText}>Style #</Text></View>
            <View style={[styles.cell, { width: "22%" }]}><Text style={styles.headerText}>Style</Text></View>
            <View style={[styles.cell, { width: "12%" }]}><Text style={styles.headerText}>Color</Text></View>
            <View style={[styles.cell, { width: "10%" }]}><Text style={styles.headerText}>FOB</Text></View>
            {data.sizes.map((s) => (
              <View key={s} style={[styles.cell, { width: sizeWidth }]}>
                <Text style={styles.headerText}>{s}</Text>
              </View>
            ))}
            <View style={[styles.cell, { width: "10%" }]}><Text style={styles.headerText}>Total</Text></View>
          </View>
          {data.rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.cell, { width: "14%" }]}><Text style={styles.cellText}>{r.styleNumber}</Text></View>
              <View style={[styles.cell, { width: "22%" }]}><Text style={styles.cellText}>{r.styleName}</Text></View>
              <View style={[styles.cell, { width: "12%" }]}><Text style={styles.cellText}>{r.color}</Text></View>
              <View style={[styles.cell, { width: "10%" }]}><Text style={styles.cellText}>{r.fob}</Text></View>
              {data.sizes.map((s) => (
                <View key={s} style={[styles.cell, { width: sizeWidth }]}>
                  <Text style={styles.cellText}>{r.quantities[s] ?? 0}</Text>
                </View>
              ))}
              <View style={[styles.cell, { width: "10%" }]}><Text style={styles.cellText}>{r.total}</Text></View>
            </View>
          ))}
          <View style={styles.row}>
            <View style={[styles.cell, { width: "58%" }]}><Text style={styles.headerText}>Grand total</Text></View>
            {data.sizes.map((s) => (
              <View key={s} style={[styles.cell, { width: sizeWidth }]}><Text /></View>
            ))}
            <View style={[styles.cell, { width: "10%" }]}><Text style={styles.headerText}>{data.grandTotal}</Text></View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function buildOrderFormPdf(data: OrderFormExportData): Promise<Buffer> {
  return renderToBuffer(<OrderFormPdf data={data} />);
}
