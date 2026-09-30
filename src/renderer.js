import { buildEpcPayload, getEpcQrEligibility, renderEpcQr } from './sepaQr.js'

let activeViewer = null

const hasValue = value =>
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ''

const hasAnyValue = values => values.some(hasValue)

function element(tagName, className = '', text = null) {
    const node = document.createElement(tagName)
    if (className) node.className = className
    if (hasValue(text)) node.textContent = String(text)
    return node
}

function appendFields(parent, values) {
    for (const [label, value] of values) {
        if (!hasValue(value)) continue
        const row = element('div', 'ublcii-viewer__field')
        row.append(
            element('dt', 'ublcii-viewer__field-label', label),
            element('dd', 'ublcii-viewer__field-value', value)
        )
        parent.append(row)
    }
}

function section(title, content, className = '') {
    const wrapper = element('section', `ublcii-viewer__panel ${className}`.trim())
    wrapper.append(element('h2', 'ublcii-viewer__panel-heading', title), content)
    return wrapper
}

function withCurrency(value, currencyCode) {
    if (!hasValue(value)) return null
    return `${value}${hasValue(currencyCode) ? ` ${currencyCode}` : ''}`
}

function renderHeader(invoice) {
    const header = element('header', 'ublcii-viewer__document-header')
    if (hasValue(invoice.documentLabel)) {
        header.append(element('p', 'ublcii-viewer__document-type', invoice.documentLabel))
    }
    if (hasValue(invoice.documentNumber)) {
        header.append(element('p', 'ublcii-viewer__document-number', invoice.documentNumber))
    }
    const fields = element('dl', 'ublcii-viewer__document-meta')
    appendFields(fields, [
        ['Issue date', invoice.issueDate],
        ['Currency', invoice.currencyCode],
    ])
    if (fields.children.length) header.append(fields)
    return header
}

function formatIdentifier(identifier) {
    if (!hasValue(identifier?.id)) return null
    return hasValue(identifier.schemeId)
        ? `${identifier.id} (${identifier.schemeId})`
        : identifier.id
}

function renderParty(party) {
    const address = party?.address || {}
    const identifiers = (party?.identifiers || [])
        .map(formatIdentifier)
        .filter(hasValue)
        .join(', ')
    const values = [
        ['Trading name', party?.tradingName],
        ['Street', address.streetName],
        ['Postal code / city', [address.postalCode, address.cityName].filter(hasValue).join(' ')],
        ['Country', address.countryCode],
        ['VAT identifier', party?.vatIdentifier],
        ['Tax registration', party?.taxRegistrationIdentifier],
        ['Legal identifier', formatIdentifier(party?.legalEntity)],
        ['Other identifiers', identifiers],
    ]
    if (!hasValue(party?.name) && !values.some(([, value]) => hasValue(value))) return null
    const content = element('div', 'ublcii-viewer__party-content')
    if (hasValue(party?.name)) content.append(element('p', 'ublcii-viewer__party-name', party.name))
    const fields = element('dl', 'ublcii-viewer__fields')
    appendFields(fields, values)
    if (fields.children.length) content.append(fields)
    return content
}

function appendCell(row, value, className = '') {
    row.append(element('td', className, hasValue(value) ? value : '—'))
}

function createTable(headings) {
    const table = element('table', 'ublcii-viewer__table')
    const head = element('thead')
    const row = element('tr')
    headings.forEach(heading => {
        const definition = typeof heading === 'string' ? { label: heading } : heading
        row.append(element('th', definition.className || '', definition.label))
    })
    head.append(row)
    table.append(head)
    return table
}

function tableSection(table) {
    const scroll = element('div', 'ublcii-viewer__table-scroll')
    scroll.append(table)
    return scroll
}

function renderLines(invoice) {
    const lines = invoice.invoiceLines || []
    if (!lines.length) return null
    const table = createTable([
        'Line',
        { label: 'Item', className: 'ublcii-viewer__item-column' },
        { label: 'Quantity', className: 'ublcii-viewer__number' },
        { label: 'Unit price', className: 'ublcii-viewer__number' },
        { label: 'VAT', className: 'ublcii-viewer__number' },
        { label: 'Net amount', className: 'ublcii-viewer__number' },
    ])
    table.classList.add('ublcii-viewer__lines-table')
    // Preserve table semantics when mobile CSS changes the visual layout.
    table.setAttribute('role', 'table')
    table.querySelector('thead').setAttribute('role', 'rowgroup')
    table.querySelector('thead tr').setAttribute('role', 'row')
    table.querySelectorAll('th').forEach(heading => {
        heading.setAttribute('role', 'columnheader')
        heading.setAttribute('scope', 'col')
    })
    const body = element('tbody')
    body.setAttribute('role', 'rowgroup')

    for (const line of lines) {
        const row = element('tr')
        const itemCell = element('td', 'ublcii-viewer__item-column')
        const itemName = line.item?.name || line.item?.description
        itemCell.append(element('span', 'ublcii-viewer__item-name', itemName || '—'))
        if (hasValue(line.item?.description) && line.item.description !== itemName) {
            itemCell.append(element('small', '', line.item.description))
        }
        if (hasValue(line.note)) itemCell.append(element('small', '', line.note))

        appendCell(row, line.id)
        row.append(itemCell)
        appendCell(row, [line.quantity, line.unitCode].filter(hasValue).join(' '), 'ublcii-viewer__number')
        appendCell(row, withCurrency(line.price?.netAmount, invoice.currencyCode), 'ublcii-viewer__number')
        appendCell(row, [line.vat?.categoryCode, hasValue(line.vat?.rate) ? `${line.vat.rate}%` : null].filter(hasValue).join(' / '), 'ublcii-viewer__number')
        appendCell(row, withCurrency(line.netAmount, invoice.currencyCode), 'ublcii-viewer__number')
        row.setAttribute('role', 'row')
        const mobileLabels = ['Line', null, 'Quantity / Unit', 'Unit price', 'VAT', 'Line total']
        Array.from(row.children).forEach((cell, index) => {
            cell.setAttribute('role', 'cell')
            if (!mobileLabels[index]) return
            const label = element('span', 'ublcii-viewer__line-label', mobileLabels[index])
            // The column headers already provide these labels to screenreaders.
            label.setAttribute('aria-hidden', 'true')
            cell.prepend(label)
        })
        body.append(row)
    }
    table.append(body)
    return tableSection(table)
}

function renderAllowancesCharges(invoice) {
    const groups = invoice.allowancesCharges || {}
    const entries = [
        ...(groups.documentLevel || []).map(item => ({ ...item, level: 'Document' })),
        ...(groups.lineLevel || []).map(item => ({ ...item, level: 'Line' })),
    ]
    if (!entries.length) return null
    const table = createTable([
        'Level', 'Type', 'Reason',
        { label: 'Base', className: 'ublcii-viewer__number' },
        { label: 'Rate', className: 'ublcii-viewer__number' },
        { label: 'Amount', className: 'ublcii-viewer__number' },
        { label: 'VAT', className: 'ublcii-viewer__number' },
    ])
    const body = element('tbody')

    for (const item of entries) {
        const row = element('tr')
        appendCell(row, item.level === 'Line' && hasValue(item.lineId) ? `Line ${item.lineId}` : item.level)
        const typeCell = element('td')
        const typeClass = item.type === 'Allowance' || item.type === 'Charge'
            ? `ublcii-viewer__badge ublcii-viewer__badge--${item.type.toLowerCase()}`
            : 'ublcii-viewer__badge ublcii-viewer__badge--neutral'
        typeCell.append(element('span', typeClass, hasValue(item.type) ? item.type : '—'))
        row.append(typeCell)
        appendCell(row, item.reason || item.reasonCode)
        appendCell(row, withCurrency(item.baseAmount, invoice.currencyCode), 'ublcii-viewer__number')
        appendCell(row, hasValue(item.percentage) ? `${item.percentage}%` : null, 'ublcii-viewer__number')
        appendCell(row, withCurrency(item.amount, invoice.currencyCode), 'ublcii-viewer__number')
        appendCell(row, [item.vat?.categoryCode, hasValue(item.vat?.rate) ? `${item.vat.rate}%` : null].filter(hasValue).join(' / '), 'ublcii-viewer__number')
        body.append(row)
    }
    table.append(body)
    return tableSection(table)
}

function renderVat(invoice) {
    const entries = invoice.vatBreakdown || []
    if (!entries.length) return null
    const table = createTable([
        'Category',
        { label: 'Rate', className: 'ublcii-viewer__number' },
        { label: 'Taxable amount', className: 'ublcii-viewer__number' },
        { label: 'Tax amount', className: 'ublcii-viewer__number' },
        'Exemption',
    ])
    const body = element('tbody')

    for (const item of entries) {
        const row = element('tr')
        appendCell(row, item.categoryCode)
        appendCell(row, hasValue(item.rate) ? `${item.rate}%` : null, 'ublcii-viewer__number')
        appendCell(row, withCurrency(item.taxableAmount, invoice.currencyCode), 'ublcii-viewer__number')
        appendCell(row, withCurrency(item.taxAmount, invoice.currencyCode), 'ublcii-viewer__number')
        appendCell(row, item.exemptionReason || item.exemptionReasonCode)
        body.append(row)
    }
    table.append(body)
    return tableSection(table)
}

function renderPayment(invoice) {
    const payment = invoice?.payment
    const instruction = payment?.instruction || {}
    const transfers = instruction.creditTransfers || []
    const dueValues = [
        ['Due date', payment?.dueDate],
        ['Terms', payment?.terms],
    ]
    const instructionValues = [
        ['Payment type', [instruction.typeCode, instruction.text].filter(hasValue).join(' — ')],
        ['Remittance information', instruction.remittanceInformation],
        ['Creditor identifier', payment?.creditorIdentifier],
    ]
    const detailValues = [
        ['Card account', instruction.card?.primaryAccountNumber],
        ['Card holder', instruction.card?.holderName],
        ['Mandate reference', instruction.directDebit?.mandateReference],
        ['Debited account', instruction.directDebit?.debitedAccountId],
    ]
    const transferValues = transfers.flatMap(transfer => [
        transfer?.accountId,
        transfer?.accountName,
        transfer?.serviceProviderId,
    ])
    const allValues = [...dueValues, ...instructionValues, ...detailValues]
    const qrEligibility = getEpcQrEligibility(invoice)
    if (!hasAnyValue([...allValues.map(([, value]) => value), ...transferValues]) && !qrEligibility.eligible) return null

    const content = element('div', 'ublcii-viewer__payment')
    const detailsView = element('div', 'ublcii-viewer__payment-groups')
    const leftColumn = element('div', 'ublcii-viewer__payment-column ublcii-viewer__payment-column--left')
    const rightColumn = element('div', 'ublcii-viewer__payment-column ublcii-viewer__payment-column--right')
    const createGroup = (title, values, className) => {
        if (!values.some(([, value]) => hasValue(value))) return null
        const block = element('div', `ublcii-viewer__subsection ${className}`)
        const fields = element('dl', 'ublcii-viewer__fields')
        appendFields(fields, values)
        block.append(element('h3', '', title), fields)
        return block
    }
    const dueGroup = createGroup('Due date and terms', dueValues, 'ublcii-viewer__payment-due')
    const instructionGroup = createGroup(
        'Payment instruction and remittance',
        instructionValues,
        'ublcii-viewer__payment-instruction'
    )
    const methodGroups = element('div', 'ublcii-viewer__payment-method-groups')
    const detailGroup = createGroup('Card or direct-debit details', detailValues, 'ublcii-viewer__payment-method')
    if (detailGroup) methodGroups.append(detailGroup)

    transfers.forEach((transfer, index) => {
        if (!hasAnyValue([transfer?.accountId, transfer?.accountName, transfer?.serviceProviderId])) return
        const block = element('div', 'ublcii-viewer__subsection ublcii-viewer__payment-transfer')
        const transferFields = element('dl', 'ublcii-viewer__fields')
        appendFields(transferFields, [
            ['Account ID', transfer.accountId],
            ['Account name', transfer.accountName],
            ['Service provider ID', transfer.serviceProviderId],
        ])
        block.append(
            element('h3', '', transfers.length > 1 ? `Credit transfer ${index + 1}` : 'Credit transfer'),
            transferFields
        )
        methodGroups.append(block)
    })
    const qrActionBlock = element('div', 'ublcii-viewer__payment-qr-action-block')
    qrActionBlock.append(element('h3', '', 'Payment QR code'))
    if (!qrEligibility.eligible) {
        const sourceAmount = String(invoice?.totals?.payableAmount ?? '').trim()
        const reason = qrEligibility.reason === 'Payment QR unavailable: the payable amount is not in a supported EPC decimal format.' &&
            /^-\d+(?:\.\d+)?$/.test(sourceAmount)
            ? 'Payment QR unavailable: the payable amount must be greater than zero.'
            : qrEligibility.reason
        qrActionBlock.append(element('p', 'ublcii-viewer__payment-qr-status', reason))
    } else {
        const showAction = element('button', 'ublcii-viewer__payment-qr-action', 'Show payment QR code')
        showAction.type = 'button'
        showAction.setAttribute('aria-expanded', 'false')
        const preview = element('div', 'ublcii-viewer__payment-qr-preview')
        const error = element('p', 'ublcii-viewer__payment-qr-error')
        error.setAttribute('role', 'alert')
        error.hidden = true
        const qrView = element('div', 'ublcii-viewer__payment-qr-view')
        qrView.hidden = true
        const hideAction = element('button', 'ublcii-viewer__payment-qr-action', 'Hide payment QR code')
        hideAction.type = 'button'
        let generated = false

        showAction.addEventListener('click', async () => {
            if (generated) {
                detailsView.hidden = true
                qrView.hidden = false
                showAction.setAttribute('aria-expanded', 'true')
                return
            }

            showAction.disabled = true
            error.hidden = true
            try {
                const data = qrEligibility.data
                const canvas = element('canvas', 'ublcii-viewer__payment-qr-canvas')
                canvas.setAttribute('aria-label', 'EPC payment QR code')
                await renderEpcQr(canvas, buildEpcPayload(data))

                const detailsColumn = element('div', 'ublcii-viewer__payment-qr-column')
                const details = element('dl', 'ublcii-viewer__fields ublcii-viewer__payment-qr-details')
                appendFields(details, [
                    ['Beneficiary', data.beneficiaryName],
                    ['IBAN', data.iban],
                    ['BIC', data.bic],
                    ['Amount', `EUR${data.amount}`],
                    ['Remittance', data.remittance],
                ])
                detailsColumn.append(element('h3', '', 'Payment details'), details)

                const codeColumn = element('div', 'ublcii-viewer__payment-qr-column ublcii-viewer__payment-qr-code-column')
                codeColumn.append(element('h3', '', 'Payment QR code'), canvas)

                const noticesColumn = element('div', 'ublcii-viewer__payment-qr-column')
                noticesColumn.append(element('h3', '', 'Warnings and notices'))
                if (data.remittanceSource === 'documentNumberFallback') {
                    noticesColumn.append(element(
                        'p',
                        'ublcii-viewer__payment-qr-notice',
                        'No payment reference was provided. The invoice number is used as an unstructured payment reference for this QR code. Verify before payment.'
                    ))
                }
                noticesColumn.append(
                    element(
                        'p',
                        'ublcii-viewer__payment-qr-warning',
                        'Verify the payment details before confirming the payment. If your bank cannot process this QR code or the payment details appear incomplete, contact the supplier.'
                    )
                )
                preview.replaceChildren(detailsColumn, codeColumn, noticesColumn)
                generated = true
                detailsView.hidden = true
                qrView.hidden = false
                showAction.setAttribute('aria-expanded', 'true')
            } catch (renderError) {
                preview.replaceChildren()
                error.textContent = 'The payment QR could not be generated. The invoice remains available; verify the payment details manually.'
                error.hidden = false
            } finally {
                showAction.disabled = false
            }
        })
        hideAction.addEventListener('click', () => {
            qrView.hidden = true
            detailsView.hidden = false
            showAction.setAttribute('aria-expanded', 'false')
        })
        qrActionBlock.append(showAction, error)
        qrView.append(hideAction, preview)
        content.append(qrView)
    }
    if (dueGroup) leftColumn.append(dueGroup)
    if (methodGroups.children.length) leftColumn.append(methodGroups)
    if (instructionGroup) rightColumn.append(instructionGroup)
    rightColumn.append(qrActionBlock)
    detailsView.append(leftColumn, rightColumn)
    content.prepend(detailsView)
    return content
}

function renderTotals(invoice) {
    const totals = invoice.totals || {}
    const values = [
        ['Line net amount', totals.lineNetAmount],
        ['Allowances', totals.allowanceAmount],
        ['Charges', totals.chargeAmount],
        ['Tax exclusive amount', totals.taxExclusiveAmount],
        ['Tax amount', totals.taxAmount],
        ['Tax inclusive amount', totals.taxInclusiveAmount],
        ['Paid amount', totals.paidAmount],
        ['Rounding amount', totals.roundingAmount],
        ['Payable amount', totals.payableAmount],
    ]
    if (!values.some(([, value]) => hasValue(value))) return null
    const content = element('dl', 'ublcii-viewer__totals')
    for (const [label, value] of values) {
        if (!hasValue(value)) continue
        const row = element('div', label === 'Payable amount' ? 'ublcii-viewer__payable' : '')
        row.append(element('dt', '', label), element('dd', '', withCurrency(value, invoice.currencyCode)))
        content.append(row)
    }
    return content
}

function renderDocument(invoice) {
    const overviewAvailable = hasAnyValue([
        invoice.documentLabel,
        invoice.documentNumber,
        invoice.issueDate,
        invoice.currencyCode,
    ])
    const sections = [
        { id: 'overview', label: 'Overview', content: overviewAvailable ? renderHeader(invoice) : null },
        { id: 'supplier', label: 'Supplier', content: renderParty(invoice.supplier || {}) },
        { id: 'customer', label: 'Customer', content: renderParty(invoice.customer || {}) },
        { id: 'lines', label: 'Lines', content: renderLines(invoice) },
        { id: 'adjustments', label: 'Adjustments', content: renderAllowancesCharges(invoice) },
        { id: 'vat', label: 'VAT', content: renderVat(invoice) },
        { id: 'totals', label: 'Totals', content: renderTotals(invoice) },
        { id: 'payment', label: 'Payment', content: renderPayment(invoice) },
    ].filter(descriptor => descriptor.content)

    if (!sections.length) return null

    const viewerId = `ublcii-viewer-document-${Date.now()}`
    const document = element('div', 'ublcii-viewer__document')
    const layout = element('div', 'ublcii-viewer__layout')
    const navigation = element('nav', 'ublcii-viewer__navigation')
    navigation.setAttribute('aria-label', 'Document sections')
    const navigationList = element('div', 'ublcii-viewer__navigation-list')
    const selectWrapper = element('div', 'ublcii-viewer__section-select-wrapper')
    const selectLabel = element('label', 'ublcii-viewer__section-select-label', 'Section')
    const select = element('select', 'ublcii-viewer__section-select')
    select.id = `${viewerId}-section-select`
    selectLabel.htmlFor = select.id
    const content = element('div', 'ublcii-viewer__content')

    sections.forEach(descriptor => {
        const panelId = `${viewerId}-${descriptor.id}`
        const headingId = `${panelId}-heading`
        const button = element('button', 'ublcii-viewer__navigation-item', descriptor.label)
        button.type = 'button'
        button.dataset.sectionId = descriptor.id
        button.setAttribute('aria-controls', panelId)
        navigationList.append(button)

        const option = element('option', '', descriptor.label)
        option.value = descriptor.id
        select.append(option)

        const panel = section(descriptor.label, descriptor.content)
        panel.id = panelId
        panel.dataset.sectionId = descriptor.id
        panel.setAttribute('aria-labelledby', headingId)
        panel.hidden = true
        const heading = panel.querySelector('.ublcii-viewer__panel-heading')
        heading.id = headingId
        heading.tabIndex = -1
        descriptor.button = button
        descriptor.panel = panel
        descriptor.heading = heading
        content.append(panel)
    })

    const activateSection = (sectionId, userInitiated = false) => {
        const activeSection = sections.find(descriptor => descriptor.id === sectionId)
        if (!activeSection) return
        sections.forEach(descriptor => {
            const active = descriptor === activeSection
            descriptor.panel.hidden = !active
            descriptor.button.classList.toggle('ublcii-viewer__navigation-item--active', active)
            if (active) descriptor.button.setAttribute('aria-current', 'page')
            else descriptor.button.removeAttribute('aria-current')
        })
        select.value = activeSection.id
        if (userInitiated) activeSection.heading.focus()
    }

    navigation.addEventListener('click', event => {
        const button = event.target.closest('.ublcii-viewer__navigation-item')
        if (!button || !navigation.contains(button)) return
        activateSection(button.dataset.sectionId, true)
    })
    select.addEventListener('change', () => activateSection(select.value, true))

    navigation.append(navigationList)
    selectWrapper.append(selectLabel, select)
    layout.append(navigation, selectWrapper, content)
    document.append(layout)
    activateSection(sections.some(descriptor => descriptor.id === 'overview') ? 'overview' : sections[0].id)
    return document
}

function stateContent(kind, title, message) {
    const state = element('div', `ublcii-viewer__state ublcii-viewer__state--${kind}`)
    state.setAttribute('role', kind === 'loading' ? 'status' : 'alert')
    state.append(element('h2', '', title), element('p', '', message))
    return state
}

export function openViewer(restoreFocus) {
    if (activeViewer) activeViewer.close(false)

    const backdrop = element('div', 'ublcii-viewer')
    const dialog = element('div', 'ublcii-viewer__dialog')
    const titleId = `ublcii-viewer-title-${Date.now()}`
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', titleId)

    const toolbar = element('div', 'ublcii-viewer__toolbar')
    const toolbarHeading = element('div', 'ublcii-viewer__toolbar-heading')
    const title = element('h1', 'ublcii-viewer__title', 'UBL/CII invoice viewer')
    title.id = titleId
    const fileName = element('p', 'ublcii-viewer__file-name')
    fileName.hidden = true
    toolbarHeading.append(title, fileName)
    const closeButton = element('button', 'ublcii-viewer__close', '×')
    closeButton.type = 'button'
    closeButton.setAttribute('aria-label', 'Close viewer')
    toolbar.append(toolbarHeading, closeButton)

    const body = element('div', 'ublcii-viewer__body')
    body.append(stateContent('loading', 'Loading document', 'The XML document is being loaded.'))
    dialog.append(toolbar, body)
    backdrop.append(dialog)
    document.body.append(backdrop)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const controller = {
        showDocument(invoice, metadata = {}) {
            fileName.textContent = hasValue(metadata.fileName) ? metadata.fileName : ''
            fileName.hidden = !hasValue(metadata.fileName)
            body.replaceChildren(
                renderDocument(invoice) ||
                stateContent('empty', 'No renderable data', 'This document contains no data that can be displayed by the viewer.')
            )
        },
        showError(titleText, message) {
            body.replaceChildren(stateContent('error', titleText, message))
        },
        close(restore = true) {
            document.removeEventListener('keydown', onKeydown)
            backdrop.remove()
            document.body.style.overflow = previousOverflow
            if (activeViewer === controller) activeViewer = null
            if (restore && restoreFocus && typeof restoreFocus.focus === 'function') {
                restoreFocus.focus()
            }
        },
    }

    const onKeydown = event => {
        if (event.key === 'Escape') controller.close()
    }
    document.addEventListener('keydown', onKeydown)
    closeButton.addEventListener('click', () => controller.close())
    backdrop.addEventListener('click', event => {
        if (event.target === backdrop) controller.close()
    })
    closeButton.focus()
    activeViewer = controller
    return controller
}
