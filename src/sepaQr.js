import QRCode from 'qrcode'

const EPC_MAX_PAYLOAD_BYTES = 331
const EPC_MAX_QR_VERSION = 13
const SUPPORTED_DOCUMENT_CODES = new Set(['380', '384', '389'])
const AMOUNT_PATTERN = /^\d{1,9}(?:\.\d{1,2})?$/
const BIC_PATTERN = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/

const trimmed = value => value === null || value === undefined
    ? ''
    : String(value).trim()

const characterLength = value => Array.from(value).length

const unavailable = reason => ({
    eligible: false,
    reason: `Payment QR unavailable: ${reason}`,
    data: null,
})

function hasLineBreak(value) {
    return /[\r\n]/.test(value)
}

export function normalizeIban(value) {
    return value === null || value === undefined
        ? ''
        : String(value).replace(/\s/g, '').toUpperCase()
}

export function isValidIban(value) {
    const iban = normalizeIban(value)
    if (!IBAN_PATTERN.test(iban)) return false

    const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
    let remainder = 0
    for (const character of rearranged) {
        const numeric = character >= 'A' && character <= 'Z'
            ? String(character.charCodeAt(0) - 55)
            : character
        for (const digit of numeric) {
            remainder = (remainder * 10 + Number(digit)) % 97
        }
    }
    return remainder === 1
}

function usableBic(value) {
    const bic = trimmed(value)
    return BIC_PATTERN.test(bic) ? bic : ''
}

export function buildEpcPayload(data) {
    const elements = [
        'BCD',
        '002',
        '1',
        'SCT',
        data.bic || '',
        data.beneficiaryName,
        data.iban,
        `EUR${data.amount}`,
        '',
        '',
        data.remittance || '',
        '',
    ]
    while (elements[elements.length - 1] === '') elements.pop()
    const payload = elements.join('\n')
    if (new TextEncoder().encode(payload).length > EPC_MAX_PAYLOAD_BYTES) {
        throw new Error('The payment details exceed the EPC QR payload limit.')
    }
    return payload
}

export function getEpcQrEligibility(invoice) {
    const documentCode = trimmed(invoice?.documentCode)
    if (documentCode === '381') return unavailable('credit notes are not payable by this QR.')
    if (!SUPPORTED_DOCUMENT_CODES.has(documentCode)) {
        return unavailable('this document type is not supported for payment QR generation.')
    }

    const sourceAmount = trimmed(invoice?.totals?.payableAmount)
    if (!sourceAmount) return unavailable('no payable amount is provided.')
    if (trimmed(invoice?.currencyCode).toUpperCase() !== 'EUR') {
        return unavailable('the payable currency must be EUR.')
    }
    if (!AMOUNT_PATTERN.test(sourceAmount)) {
        return unavailable('the payable amount is not in a supported EPC decimal format.')
    }
    const numericAmount = Number(sourceAmount)
    if (numericAmount < 0.01) return unavailable('the payable amount must be greater than zero.')
    if (numericAmount > 999999999.99) return unavailable('the payable amount exceeds the EPC limit.')

    const transfers = invoice?.payment?.instruction?.creditTransfers || []
    const usableTransfers = transfers
        .map(transfer => ({ transfer, iban: normalizeIban(transfer?.accountId) }))
        .filter(({ iban }) => isValidIban(iban))
    if (!usableTransfers.length) {
        return unavailable('no eligible IBAN payment account is provided.')
    }
    if (usableTransfers.length > 1) {
        return unavailable('multiple eligible payment accounts are provided.')
    }

    const { transfer, iban } = usableTransfers[0]
    const beneficiaryName = trimmed(transfer?.accountName) || trimmed(invoice?.supplier?.name)
    if (!beneficiaryName) return unavailable('no beneficiary name is provided.')
    if (hasLineBreak(beneficiaryName)) return unavailable('the beneficiary name contains a line break.')
    if (characterLength(beneficiaryName) > 70) {
        return unavailable('the beneficiary name exceeds 70 characters.')
    }

    const suppliedRemittance = trimmed(invoice?.payment?.instruction?.remittanceInformation)
    const documentNumber = trimmed(invoice?.documentNumber)
    let remittance = suppliedRemittance
    let remittanceSource = suppliedRemittance ? 'invoice' : 'none'
    if (!remittance && documentNumber && characterLength(documentNumber) <= 140) {
        remittance = documentNumber
        remittanceSource = 'documentNumberFallback'
    }
    if (hasLineBreak(remittance)) return unavailable('the payment reference contains a line break.')
    if (characterLength(remittance) > 140) {
        return unavailable('the payment reference exceeds 140 characters.')
    }

    const data = {
        beneficiaryName,
        iban,
        bic: usableBic(transfer?.serviceProviderId),
        amount: sourceAmount,
        remittance,
        remittanceSource,
    }
    return { eligible: true, reason: null, data }
}

export async function renderEpcQr(canvas, payload) {
    const segments = [{ data: payload, mode: 'byte' }]
    const options = { errorCorrectionLevel: 'M', margin: 4, width: 280 }
    const qr = QRCode.create(segments, options)
    if (qr.version > EPC_MAX_QR_VERSION) {
        throw new Error('The payment details require a QR code larger than EPC version 13.')
    }
    await QRCode.toCanvas(canvas, segments, options)
}
