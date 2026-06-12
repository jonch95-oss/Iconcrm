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
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export interface LineSheetRow {
  imageUrl: string | null;
  styleNumber: string;
  styleName: string;
  brand: string;
  category: string;
  description: string;
  price: string;
  sizes: string;
  colors: string;
}

export interface LineSheetData {
  title: string;
  date: string;
  rows: LineSheetRow[];
}

/** Load selected samples into customer-facing line sheet rows (sell price, never FOB). */
export async function getLineSheetData(sampleIds: string[]): Promise<LineSheetData> {
  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds } },
    include: { skuVariants: true },
    orderBy: [{ brand: "asc" }, { styleNumber: "asc" }],
  });
  return {
    title: "Line Sheet",
    date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    rows: samples.map((s) => ({
      imageUrl: s.imageUrl,
      styleNumber: s.styleNumber ?? s.sampleNumber,
      styleName: s.styleName ?? "—",
      brand: s.brand ?? "—",
      category: s.category ?? "—",
      description: s.description ?? "",
      price: s.customerSellPrice ? formatMoney(s.customerSellPrice, s.currency) : "On request",
      sizes: [...new Set(s.skuVariants.map((v) => v.size))].join(", ") || "—",
      colors: [...new Set(s.skuVariants.map((v) => v.color))].join(", ") || "—",
    })),
  };
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  company: { fontSize: 18, fontWeight: "bold" },
  sub: { fontSize: 10, color: "#555", marginBottom: 14 },
  card: {
    border: "1pt solid #ddd",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    gap: 10,
  },
  photo: { width: 64, height: 64, objectFit: "contain" },
  photoBox: { width: 64 },
  cardBody: { flex: 1 },
  styleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  styleName: { fontSize: 11, fontWeight: "bold" },
  price: { fontSize: 11, fontWeight: "bold" },
  meta: { fontSize: 8, color: "#555", marginBottom: 1 },
  desc: { fontSize: 8, color: "#333", marginTop: 3 },
});

function LineSheetPdf({ data }: { data: LineSheetData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.company}>{data.title}</Text>
        <Text style={styles.sub}>
          {data.date} · {data.rows.length} styles · Prices wholesale, FOB excluded
        </Text>
        {data.rows.map((r, i) => (
          <View key={i} style={styles.card} wrap={false}>
            {r.imageUrl ? (
              <View style={styles.photoBox}>
                <Image src={r.imageUrl} style={styles.photo} />
              </View>
            ) : null}
            <View style={styles.cardBody}>
            <View style={styles.styleRow}>
              <Text style={styles.styleName}>
                {r.styleNumber} — {r.styleName}
              </Text>
              <Text style={styles.price}>{r.price}</Text>
            </View>
            <Text style={styles.meta}>
              {r.brand} · {r.category}
            </Text>
            <Text style={styles.meta}>
              Sizes: {r.sizes} · Colors: {r.colors}
            </Text>
            {r.description ? <Text style={styles.desc}>{r.description}</Text> : null}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function buildLineSheetPdf(data: LineSheetData): Promise<Buffer> {
  return renderToBuffer(<LineSheetPdf data={data} />);
}
