# UBL/CII Viewer for Nextcloud

Inspect electronic invoices (UBL and CII XML) directly in Nextcloud Files, without reading raw XML.

![UBL/CII Viewer preview](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot000.png)

*Nextcloud Files with an XML file selected and the UBL/CII Viewer menu action, which opens the invoice data in a modal*

## What does it do?

UBL/CII Viewer is a **read-only** Nextcloud Files viewer for structured e-invoice data. Open an invoice XML and the app shows it in clearly separated sections instead of raw XML:

- **Overview**: document type, number, dates and references
- **Supplier** and **Customer**
- **Lines**
- **Adjustments** (allowances and charges)
- **VAT**
- **Totals**
- **Payment**, with an optional on-demand EPC/SEPA payment QR code

Sections without displayable content are hidden. The XML remains the source of truth: the app stores no supplier or customer data, does not recalculate amounts and does not infer missing information.

## Why is it useful?

- Check parties, lines, VAT, totals and payment details at a glance.
- Works inside Nextcloud: no download and no separate tool needed.
- Also reads supported CII XML embedded in Factur-X/ZUGFeRD PDFs (see below).

## Supported documents

| Syntax | Document             | Code |
|--------|----------------------|------|
| UBL    | Invoice              | 380  |
| UBL    | Credit Note          | 381  |
| UBL    | Self-Billing Invoice | 389  |
| CII    | Invoice              | 380  |
| CII    | Credit Note          | 381  |
| CII    | Corrective Invoice   | 384  |
| CII    | Self-Billing Invoice | 389  |

Self-Billing uses the normal invoice viewer without a separate workflow or business logic.

## Usage

In Nextcloud Files, use the file menu:

- **XML file:** **UBL/CII Viewer**
- **Factur-X/ZUGFeRD PDF:** **UBL/CII Viewer (embedded XML)**, available to signed-in users in Files (not on public-share pages). The normal Nextcloud PDF open action remains unchanged; this app is not a general PDF viewer.

### Embedded XML from PDFs

Only supported embedded CII XML is processed. Candidate attachment names are `factur-x.xml`, `zugferd-invoice.xml` and `xrechnung.xml` (case-insensitive). Exactly one candidate is required, and its content must be supported CII. This is not general Factur-X/ZUGFeRD profile validation, PDF rendering, OCR or reconstruction of invoice data.

PDF extraction requires server-side Poppler `pdfdetach` at `/usr/bin/pdfdetach` and PHP `proc_open()`. Poppler is optional: direct XML viewing works without it. On Ubuntu/Debian a server administrator can install it with:

```
sudo apt install poppler-utils
```

Limits: 25 MB per PDF, 10 MB extracted XML, 20 attachments, 15-second timeout.

### Payment and EPC/SEPA QR

QR codes are generated on demand from available payment data; generating a code does not execute a payment. A QR code may be unavailable without an eligible IBAN/payment account, a positive payable amount or other required EPC-compatible data.

## Germany and e-invoicing

Need to view CII e-invoices in Nextcloud? UBL/CII Viewer helps you inspect structured invoice data directly in Nextcloud Files, including supported CII XML embedded in Factur-X/ZUGFeRD PDFs. This can be useful in the context of Germany's e-invoicing requirements. The app is a read-only viewer; it does not certify legal compliance or replace accounting, archiving, or invoice-validation software.

## Screenshots

| | |
|---|---|
| ![Overview](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot001.png) | ![Totals](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot002.png) |
| *Overview section with general invoice header information from a UBL file* | *Totals section with all totals from a UBL file* |
| ![Payment](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot003.png) | ![Payment QR code](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot004.png) |
| *Payment section with payment data and a Show payment QR code button* | *Payment details, warnings and notices, and the EPC/SEPA QR code with a Hide payment QR code button* |
| ![PDF action in Files](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot005.png) | ![Embedded XML: Overview](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot006.png) |
| *Nextcloud Files with a PDF selected and the UBL/CII Viewer (embedded XML) menu action* | *Overview of the CII XML embedded in a PDF* |
| ![Embedded XML: Supplier](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot007.png) | ![Embedded XML: Payment](https://raw.githubusercontent.com/Verony-makesIT/files_ublcii_viewer-public/main/screenshots/screenshot008.png) |
| *Supplier data extracted from the embedded XML of a PDF* | *Payment data and QR code from the embedded XML of a PDF* |

## Installation and requirements

Install **UBL/CII Viewer** (app ID `files_ublcii_viewer`) from the [Nextcloud App Store](https://apps.nextcloud.com/apps/files_ublcii_viewer) or from the Apps page of your Nextcloud instance.

- Nextcloud **34** (current minimum and maximum supported major version)
- Optional, for PDF extraction: Poppler and PHP process execution as described above

Manual installation: place the app directory, including its built `js/` assets, as `files_ublcii_viewer` in a configured Nextcloud apps directory and enable it as an administrator.

## Known limitations

- Viewer only: it does not edit or generate invoices, perform accounting or export to accounting software.
- Structural, document-detection and QR-eligibility checks are performed, but there is no normative invoice, fiscal or business validation.
- Malformed XML, unsupported documents and extraction failures produce controlled error messages.
- Not a general PDF viewer; no OCR.

## Build from source

Use Node.js 24.x and npm. From the repository root, with dependencies installed:

```
npm run build
```

A known webpack warning about `stream` through `sax` remains; a successful build does not replace runtime verification.

## License and project links

Licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).

- [Source code](https://github.com/Verony-makesIT/files_ublcii_viewer-public)
- [Issues and feature requests](https://github.com/Verony-makesIT/files_ublcii_viewer-public/issues)
