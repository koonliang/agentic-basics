# Multimodal policy PDF review set

These are synthetic training documents for the proposed RAG labs. The policy guides combine selectable text with embedded raster images. Important values in the diagrams are intentionally not repeated in selectable text so that later labs can compare text-only and visual retrieval.

## Files

- `pdfs/sg-refund-policy-current.pdf`
- `pdfs/sg-refund-policy-superseded.pdf`
- `pdfs/au-refund-policy-current.pdf`
- `pdfs/shipping-investigation-guide.pdf`
- `pdfs/product-warranty-guide.pdf`
- `pdfs/support-escalation-guide.pdf`
- `pdfs/return-processing-table-native.pdf`
- `pdfs/return-processing-table-image.pdf`

The `assets/` directory contains the SVG sources and embedded PNG versions of the visuals. `catalog.json` contains document metadata.

## Table extraction comparison

The two return-processing files contain the same six-row table. In the native version, every cell is selectable PDF text. In the image version, the table is an embedded PNG and its facts are not repeated in selectable text. Ingest the files separately when comparing extraction behavior.

Suggested questions and ground-truth answers:

- What fee applies to opened electronics returned in Singapore? **10%.**
- Compare electronics rules for Singapore and Australia. **Singapore: 30 days, 10% if opened, refund. Australia: 30 days, no fee, refund or replacement.**
- Which Singapore product has a 21-day window? **Home appliances; 15% if installed; installation report; warranty review.**
- What is the clearance-item exception? **Final sale, with safety review only when safety evidence is provided.**

## Regenerate

```bash
npm install
npm run generate
```

These documents are fictional and must not be used as real customer-support policy.
