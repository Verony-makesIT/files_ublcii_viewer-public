# UBL/CII Viewer

A read-only Nextcloud Files viewer for electronic invoices in UBL and CII XML,
with optional embedded CII extraction from Factur-X/ZUGFeRD PDFs and on-demand
EPC/SEPA payment QR codes.

## Supported documents

| Syntax | Document | Code |
| --- | --- | --- |
| UBL | Invoice | 380 |
| UBL | Credit Note | 381 |
| UBL Invoice | Self-Billing Invoice | 389 |
| CII | Invoice | 380 |
| CII | Credit Note | 381 |
| CII | Corrective Invoice | 384 |
| CII | Self-Billing Invoice | 389 |

Self-Billing uses the normal invoice viewer without a separate workflow or
business logic. Only data present in the source is displayed.

## Viewer and usage

In Nextcloud Files, use the file menu:

- XML: **UBL/CII Viewer**.
- Factur-X/ZUGFeRD PDF: **UBL/CII Viewer (embedded XML)**, available to signed-in
  users in Files, not public-share pages. The normal Nextcloud PDF open action
  remains unchanged.

The responsive viewer provides Overview, Supplier, Customer, Lines, Adjustments,
VAT, Totals and Payment sections. Sections without displayable content are hidden.

### Embedded XML from PDFs

Only supported embedded CII XML is processed. Candidate attachment names are
`factur-x.xml`, `zugferd-invoice.xml` and `xrechnung.xml` (case-insensitive).
Exactly one candidate is required; its XML content must be supported CII.
This is not general Factur-X/ZUGFeRD profile validation, PDF rendering, OCR or
reconstruction of invoice data.

PDF extraction requires server-side Poppler `pdfdetach` at `/usr/bin/pdfdetach`
and available PHP `proc_open()`. Poppler is optional: direct XML viewing continues
to work without it. On **Ubuntu/Debian**, a server administrator can install it with:

```sh
sudo apt install poppler-utils
```

This command is specific to Ubuntu/Debian. Extraction limits are 25 MB per PDF,
10 MB extracted XML, 20 attachments and a 15-second extraction timeout.

### Payment and EPC/SEPA QR

QR codes are generated on demand from available normalized payment data; generating
a code does not execute a payment. Missing payment data is not reconstructed.
QR may be unavailable without an eligible IBAN/payment account, a positive payable
amount, or other required EPC-compatible data. Payment details remain source data.

## Error handling and limitations

Malformed XML, unsupported documents and extraction failures receive controlled
error messages. Structural, document-detection and QR-eligibility checks are
performed, but the app does not provide normative invoice, fiscal, accounting or
business validation. It does not edit or generate invoices, perform accounting,
or export to accounting software. XML remains the source of truth; amounts are
not recalculated and missing information is not inferred.

## Requirements and installation

- Nextcloud **34** (minimum and maximum supported major version).
- For optional PDF extraction: Poppler and PHP process execution as described above.
- Node.js is needed for building, not for normal use of a prepared app.

For manual installation, place the app directory, including its built `js/` assets,
as `files_ublcii_viewer` in a configured Nextcloud apps directory, then enable
**UBL/CII Viewer** through Nextcloud's app management as an administrator.
This does not assume an App Store release.

For local development, a symlink from a configured apps directory to the repository
can be used instead of copying the app. This is a development setup, not a normal
installation requirement; the webserver must be able to read the app files.

## Build from source

Use Node.js **24.x**, the compatible major version for the current direct dependency
engine requirements, and npm. With the repository dependencies already installed,
run from the repository root:

```sh
npm run build
```

This runs the existing webpack production configuration. A known webpack warning
about `stream` through `sax` remains; a successful build alone does not replace
runtime verification. Distributed JavaScript/CSS changes require appropriate app
versioning for Nextcloud asset cache-busting.

## License and project links

Licensed under **AGPL-3.0-or-later** (GNU Affero General Public License version 3
or, at your option, any later version). See [LICENSE](LICENSE) for the full text.

- [Source code](https://github.com/Verony-makesIT/files_ublcii_viewer-public)
- [Issues and feature requests](https://github.com/Verony-makesIT/files_ublcii_viewer-public/issues)
