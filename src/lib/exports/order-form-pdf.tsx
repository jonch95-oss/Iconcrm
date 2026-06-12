import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { OrderFormExportData } from "./order-form";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  banner: {
    backgroundColor: "#E8E8E8",
    padding: 10,
    textAlign: "center",
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  info: { fontSize: 8, marginBottom: 1.5 },
  infoLabel: { fontFamily: "Helvetica-Bold" },
  table: { marginTop: 8, borderTop: "1pt solid #999", borderLeft: "1pt solid #999" },
  row: { flexDirection: "row" },
  cell: {
    borderRight: "1pt solid #999",
    borderBottom: "1pt solid #999",
    padding: 3,
    justifyContent: "center",
  },
  headText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", textAlign: "center" },
  cellText: { fontSize: 7 },
  num: { fontSize: 7, textAlign: "center" },
});

const W = {
  img: "9%", desc: "13%", tp: "8%", style: "8%", color: "7%", size: "6%",
  pack: "5%", cases: "5%", qty: "6%", comp: "10%", upc: "9%", fob: "5%",
  freight: "5%", ldp: "4%",
};

function Pdf({ data }: { data: OrderFormExportData }) {
  const ttl = data.rows.reduce((n, r) => n + r.quantity, 0);
  const ldp = (r: OrderFormExportData["rows"][number]) =>
    r.fob === null ? null : Math.round((r.fob * (1 + (r.dutyRatePercent ?? 0) / 100) + (r.freight ?? 0)) * 100) / 100;
  const ttlLdp = data.rows.reduce((n, r) => {
    const v = ldp(r);
    return v === null ? n : n + v * r.quantity;
  }, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.banner}>Production Order Form</Text>
        <Text style={styles.info}><Text style={styles.infoLabel}>Customer: </Text>{data.customer ?? ""}</Text>
        <Text style={styles.info}><Text style={styles.infoLabel}>Customer PO #: </Text>{data.customerPoNumbers}</Text>
        <Text style={styles.info}><Text style={styles.infoLabel}>Factory: </Text>{data.factoryName ?? ""}</Text>
        <Text style={styles.info}><Text style={styles.infoLabel}>Order Form #: </Text>{data.orderFormNumber}</Text>
        <Text style={styles.info}><Text style={styles.infoLabel}>PI NO.: </Text>______________  <Text style={styles.infoLabel}>SHIP ETA: </Text>____________  <Text style={styles.infoLabel}>DELIVERY ETA: </Text>____________</Text>

        <View style={styles.table}>
          <View style={styles.row}>
            {[
              ["IMAGE", W.img], ["DESCRIPTION", W.desc], ["TP STYLE #", W.tp], ["STYLE #", W.style],
              ["COLOR", W.color], ["SIZE", W.size], ["CASE PACK", W.pack], ["TTL CASES", W.cases],
              ["TTL QTY", W.qty], ["COMPOSITION", W.comp], ["UPC", W.upc], ["FOB", W.fob],
              ["FREIGHT", W.freight], ["LDP", W.ldp],
            ].map(([h, w]) => (
              <View key={h} style={[styles.cell, { width: w, backgroundColor: "#E8E8E8" }]}>
                <Text style={styles.headText}>{h}</Text>
              </View>
            ))}
          </View>
          {data.rows.map((r, i) => {
            const l = ldp(r);
            return (
              <View key={i} style={styles.row} wrap={false}>
                <View style={[styles.cell, { width: W.img }]}>
                  {r.imageUrl ? (
                    <Image src={r.imageUrl} style={{ width: 42, height: 42, objectFit: "contain" }} />
                  ) : (
                    <Text style={styles.cellText}> </Text>
                  )}
                </View>
                <View style={[styles.cell, { width: W.desc }]}><Text style={styles.cellText}>{r.description}</Text></View>
                <View style={[styles.cell, { width: W.tp }]}><Text style={styles.cellText}>{r.tpStyleNumber}</Text></View>
                <View style={[styles.cell, { width: W.style }]}><Text style={styles.cellText}>{r.styleNumber}</Text></View>
                <View style={[styles.cell, { width: W.color }]}><Text style={styles.cellText}>{r.color}</Text></View>
                <View style={[styles.cell, { width: W.size }]}><Text style={styles.num}>{r.size}</Text></View>
                <View style={[styles.cell, { width: W.pack }]}><Text style={styles.num}>{r.casePack ?? ""}</Text></View>
                <View style={[styles.cell, { width: W.cases }]}><Text style={styles.num}>{r.casePack ? Math.ceil(r.quantity / r.casePack) : ""}</Text></View>
                <View style={[styles.cell, { width: W.qty }]}><Text style={styles.num}>{r.quantity}</Text></View>
                <View style={[styles.cell, { width: W.comp }]}><Text style={styles.cellText}>{r.composition}</Text></View>
                <View style={[styles.cell, { width: W.upc }]}><Text style={styles.num}>{r.upc}</Text></View>
                <View style={[styles.cell, { width: W.fob }]}><Text style={styles.num}>{r.fob !== null ? `$${r.fob.toFixed(2)}` : ""}</Text></View>
                <View style={[styles.cell, { width: W.freight }]}><Text style={styles.num}>{r.freight !== null ? `$${r.freight.toFixed(2)}` : ""}</Text></View>
                <View style={[styles.cell, { width: W.ldp }]}><Text style={styles.num}>{l !== null ? `$${l.toFixed(2)}` : ""}</Text></View>
              </View>
            );
          })}
          <View style={styles.row}>
            <View style={[styles.cell, { width: "59%" }]}><Text style={[styles.cellText, { fontFamily: "Helvetica-Bold" }]}>TOTALS</Text></View>
            <View style={[styles.cell, { width: W.qty }]}><Text style={[styles.num, { fontFamily: "Helvetica-Bold" }]}>{ttl}</Text></View>
            <View style={[styles.cell, { width: "29%" }]}><Text style={[styles.num, { fontFamily: "Helvetica-Bold" }]}>TTL LDP: ${ttlLdp.toFixed(2)}</Text></View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function buildOrderFormPdf(data: OrderFormExportData): Promise<Buffer> {
  return renderToBuffer(<Pdf data={data} />);
}
