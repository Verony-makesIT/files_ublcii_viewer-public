import {
    DefaultType,
    registerFileAction,
} from '@nextcloud/files'

import { generateUrl } from '@nextcloud/router'

import { openViewer } from './renderer.js'


function detectDocument(xmlDoc) {
    const rootName = xmlDoc.documentElement.localName
    const rootNamespace = xmlDoc.documentElement.namespaceURI

    let syntax = 'UNKNOWN'

    if (
        rootName === 'Invoice' ||
        rootName === 'CreditNote'
    ) {
        syntax = 'UBL'
    }
    else if (
        rootName === 'CrossIndustryInvoice'
    ) {
        syntax = 'CII'
    }

    return {
        syntax,
        rootName,
        rootNamespace,
    }
}

function getDocumentCode(xmlDoc, syntax) {

    if (syntax === 'UBL') {

        const invoiceType =
            xmlDoc.getElementsByTagNameNS(
                '*',
                'InvoiceTypeCode'
            )[0]

        if (invoiceType) {
            return invoiceType.textContent.trim()
        }

        const creditNoteType =
            xmlDoc.getElementsByTagNameNS(
                '*',
                'CreditNoteTypeCode'
            )[0]

        if (creditNoteType) {
            return creditNoteType.textContent.trim()
        }
    }

    if (syntax === 'CII') {

        const typeCode =
            xmlDoc.getElementsByTagNameNS(
                '*',
                'TypeCode'
            )[0]

        if (typeCode) {
            return typeCode.textContent.trim()
        }
    }

    return null
}

function getDocumentNumber(xmlDoc, syntax) {

    if (syntax === 'UBL') {

        const id =
            xmlDoc.getElementsByTagNameNS(
                '*',
                'ID'
            )[0]

        if (id) {
            return id.textContent.trim()
        }
    }

    if (syntax === 'CII') {

        const exchangedDocument =
            xmlDoc.getElementsByTagNameNS(
                '*',
                'ExchangedDocument'
            )[0]

        if (exchangedDocument) {

            const id =
                exchangedDocument.getElementsByTagNameNS(
                    '*',
                    'ID'
                )[0]

            if (id) {
                return id.textContent.trim()
            }
        }
    }

    return null
}

function getIssueDate(xmlDoc, syntax) {

    if (syntax === 'UBL') {

        const issueDate =
            xmlDoc.getElementsByTagNameNS(
                '*',
                'IssueDate'
            )[0]

        if (issueDate) {
            return issueDate.textContent.trim()
        }
    }

    if (syntax === 'CII') {

        const issueDateTime =
            xmlDoc.getElementsByTagNameNS(
                '*',
                'IssueDateTime'
            )[0]

        if (issueDateTime) {

            const dateTimeString =
                issueDateTime.getElementsByTagNameNS(
                    '*',
                    'DateTimeString'
                )[0]

            if (dateTimeString) {
                return normalizeCiiDateTimeString(
                    dateTimeString
                )
            }
        }
    }

    return null
}

function createEmptySupplier() {
    return {
        name: null,
        tradingName: null,
        identifiers: [],
        legalEntity: {
            id: null,
            schemeId: null,
        },
        vatIdentifier: null,
        taxRegistrationIdentifier: null,
        address: {
            streetName: null,
            postalCode: null,
            cityName: null,
            countryCode: null,
        },
    }
}

function createEmptyCustomer() {
    return {
        name: null,
        tradingName: null,
        identifiers: [],
        legalEntity: {
            id: null,
            schemeId: null,
        },
        vatIdentifier: null,
        address: {
            streetName: null,
            postalCode: null,
            cityName: null,
            countryCode: null,
        },
    }
}

function createEmptyPayment() {
    return {
        dueDate: null,
        terms: null,
        instruction: null,
        creditorIdentifier: null,
    }
}

function createEmptyPaymentInstruction() {
    return {
        typeCode: null,
        text: null,
        remittanceInformation: null,
        creditTransfers: [],
        card: null,
        directDebit: null,
    }
}

function createEmptyTotals() {
    return {
        lineNetAmount: null,
        allowanceAmount: null,
        chargeAmount: null,
        taxExclusiveAmount: null,
        taxAmount: null,
        taxInclusiveAmount: null,
        paidAmount: null,
        roundingAmount: null,
        payableAmount: null,
    }
}

function getDirectChildByLocalName(parent, localName) {
    if (!parent) {
        return null
    }

    return Array.from(parent.children)
        .find(child => child.localName === localName) ?? null
}

function getDirectChildrenByLocalName(parent, localName) {
    if (!parent) {
        return []
    }

    return Array.from(parent.children)
        .filter(child => child.localName === localName)
}

function getElementText(element) {
    if (!element) {
        return null
    }

    const value = element.textContent.trim()

    return value === '' ? null : value
}

function getAttributeOrNull(element, attributeName) {
    if (
        !element ||
        !element.hasAttribute(attributeName)
    ) {
        return null
    }

    const value =
        element
            .getAttribute(attributeName)
            .trim()

    return value === ''
        ? null
        : value
}


function getElementAttribute(element, attributeName) {
    if (!element || !element.hasAttribute(attributeName)) {
        return null
    }

    const value = element.getAttribute(attributeName).trim()

    return value === '' ? null : value
}

function normalizeCiiDateTimeString(element) {
    if (!element) {
        return null
    }

    const value =
        getElementText(element)

    if (value === null) {
        return null
    }

    const format =
        getElementAttribute(
            element,
            'format'
        )

    if (
        format === '102' &&
        /^\d{8}$/.test(value)
    ) {
        return (
            value.substring(0, 4) +
            '-' +
            value.substring(4, 6) +
            '-' +
            value.substring(6, 8)
        )
    }

    return value
}

function firstNonNull(currentValue, candidateValue) {
    return currentValue !== null
        ? currentValue
        : candidateValue
}

function createCreditTransfer(
    accountId,
    accountName,
    serviceProviderId
) {
    return {
        accountId,
        accountName,
        serviceProviderId,
    }
}

function parseSupplier(xmlDoc, syntax) {
    if (syntax === 'UBL') {
        return parseUblSupplier(xmlDoc)
    }

    if (syntax === 'CII') {
        return parseCiiSupplier(xmlDoc)
    }

    return createEmptySupplier()
}

function parseUblSupplier(xmlDoc) {
    const supplier = createEmptySupplier()

    const accountingSupplierParty =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'AccountingSupplierParty'
        )[0]

    const party =
        getDirectChildByLocalName(
            accountingSupplierParty,
            'Party'
        )

    if (!party) {
        return supplier
    }

    const partyLegalEntity =
        getDirectChildByLocalName(
            party,
            'PartyLegalEntity'
        )

    supplier.name =
        getElementText(
            getDirectChildByLocalName(
                partyLegalEntity,
                'RegistrationName'
            )
        )

    const partyName =
        getDirectChildByLocalName(
            party,
            'PartyName'
        )

    supplier.tradingName =
        getElementText(
            getDirectChildByLocalName(
                partyName,
                'Name'
            )
        )

    const partyIdentifications =
        getDirectChildrenByLocalName(
            party,
            'PartyIdentification'
        )

    supplier.identifiers = partyIdentifications
        .map(partyIdentification => {
            const idElement =
                getDirectChildByLocalName(
                    partyIdentification,
                    'ID'
                )

            return {
                id: getElementText(idElement),
                schemeId: getElementAttribute(
                    idElement,
                    'schemeID'
                ),
            }
        })
        .filter(identifier =>
            identifier.id !== null &&
            identifier.schemeId !== 'SEPA'
        )

    const companyIdElement =
        getDirectChildByLocalName(
            partyLegalEntity,
            'CompanyID'
        )

    supplier.legalEntity.id =
        getElementText(companyIdElement)

    supplier.legalEntity.schemeId =
        getElementAttribute(
            companyIdElement,
            'schemeID'
        )

    const partyTaxSchemes =
        getDirectChildrenByLocalName(
            party,
            'PartyTaxScheme'
        )

    for (const partyTaxScheme of partyTaxSchemes) {
        const companyId =
            getElementText(
                getDirectChildByLocalName(
                    partyTaxScheme,
                    'CompanyID'
                )
            )

        const taxScheme =
            getDirectChildByLocalName(
                partyTaxScheme,
                'TaxScheme'
            )

        const taxSchemeId =
            getElementText(
                getDirectChildByLocalName(
                    taxScheme,
                    'ID'
                )
            )

        if (taxSchemeId === 'VAT') {
            supplier.vatIdentifier = companyId
        }
        else if (taxSchemeId !== null) {
            supplier.taxRegistrationIdentifier = companyId
        }
    }

    const postalAddress =
        getDirectChildByLocalName(
            party,
            'PostalAddress'
        )

    supplier.address.streetName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'StreetName'
            )
        )

    supplier.address.postalCode =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'PostalZone'
            )
        )

    supplier.address.cityName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'CityName'
            )
        )

    const country =
        getDirectChildByLocalName(
            postalAddress,
            'Country'
        )

    supplier.address.countryCode =
        getElementText(
            getDirectChildByLocalName(
                country,
                'IdentificationCode'
            )
        )

    return supplier
}

function parseCiiSupplier(xmlDoc) {
    const supplier = createEmptySupplier()

    const sellerTradeParty =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'SellerTradeParty'
        )[0]

    if (!sellerTradeParty) {
        return supplier
    }

    supplier.name =
        getElementText(
            getDirectChildByLocalName(
                sellerTradeParty,
                'Name'
            )
        )

    const legalOrganization =
        getDirectChildByLocalName(
            sellerTradeParty,
            'SpecifiedLegalOrganization'
        )

    supplier.tradingName =
        getElementText(
            getDirectChildByLocalName(
                legalOrganization,
                'TradingBusinessName'
            )
        )

    const sellerIds = [
        ...getDirectChildrenByLocalName(
            sellerTradeParty,
            'ID'
        ),
        ...getDirectChildrenByLocalName(
            sellerTradeParty,
            'GlobalID'
        ),
    ]

    supplier.identifiers = sellerIds
        .map(idElement => ({
            id: getElementText(idElement),
            schemeId: getElementAttribute(
                idElement,
                'schemeID'
            ),
        }))
        .filter(identifier => identifier.id !== null)

    const legalOrganizationId =
        getDirectChildByLocalName(
            legalOrganization,
            'ID'
        )

    supplier.legalEntity.id =
        getElementText(legalOrganizationId)

    supplier.legalEntity.schemeId =
        getElementAttribute(
            legalOrganizationId,
            'schemeID'
        )

    const taxRegistrations =
        getDirectChildrenByLocalName(
            sellerTradeParty,
            'SpecifiedTaxRegistration'
        )

    for (const taxRegistration of taxRegistrations) {
        const idElement =
            getDirectChildByLocalName(
                taxRegistration,
                'ID'
            )

        const identifier =
            getElementText(idElement)

        const schemeId =
            getElementAttribute(
                idElement,
                'schemeID'
            )

        if (schemeId === 'VA') {
            supplier.vatIdentifier = identifier
        }
        else if (schemeId === 'FC') {
            supplier.taxRegistrationIdentifier = identifier
        }
    }

    const postalAddress =
        getDirectChildByLocalName(
            sellerTradeParty,
            'PostalTradeAddress'
        )

    supplier.address.streetName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'LineOne'
            )
        )

    supplier.address.postalCode =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'PostcodeCode'
            )
        )

    supplier.address.cityName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'CityName'
            )
        )

    supplier.address.countryCode =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'CountryID'
            )
        )

    return supplier
}

function parseCustomer(xmlDoc, syntax) {
    if (syntax === 'UBL') {
        return parseUblCustomer(xmlDoc)
    }

    if (syntax === 'CII') {
        return parseCiiCustomer(xmlDoc)
    }

    return createEmptyCustomer()
}

function parseUblCustomer(xmlDoc) {
    const customer = createEmptyCustomer()

    const accountingCustomerParty =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'AccountingCustomerParty'
        )[0]

    const party =
        getDirectChildByLocalName(
            accountingCustomerParty,
            'Party'
        )

    if (!party) {
        return customer
    }

    const partyLegalEntity =
        getDirectChildByLocalName(
            party,
            'PartyLegalEntity'
        )

    customer.name =
        getElementText(
            getDirectChildByLocalName(
                partyLegalEntity,
                'RegistrationName'
            )
        )

    const partyName =
        getDirectChildByLocalName(
            party,
            'PartyName'
        )

    customer.tradingName =
        getElementText(
            getDirectChildByLocalName(
                partyName,
                'Name'
            )
        )

    const partyIdentifications =
        getDirectChildrenByLocalName(
            party,
            'PartyIdentification'
        )

    customer.identifiers = partyIdentifications
        .map(partyIdentification => {
            const idElement =
                getDirectChildByLocalName(
                    partyIdentification,
                    'ID'
                )

            return {
                id: getElementText(idElement),
                schemeId: getElementAttribute(
                    idElement,
                    'schemeID'
                ),
            }
        })
        .filter(identifier => identifier.id !== null)

    const companyIdElement =
        getDirectChildByLocalName(
            partyLegalEntity,
            'CompanyID'
        )

    customer.legalEntity.id =
        getElementText(companyIdElement)

    customer.legalEntity.schemeId =
        getElementAttribute(
            companyIdElement,
            'schemeID'
        )

    const partyTaxSchemes =
        getDirectChildrenByLocalName(
            party,
            'PartyTaxScheme'
        )

    for (const partyTaxScheme of partyTaxSchemes) {
        const companyId =
            getElementText(
                getDirectChildByLocalName(
                    partyTaxScheme,
                    'CompanyID'
                )
            )

        const taxScheme =
            getDirectChildByLocalName(
                partyTaxScheme,
                'TaxScheme'
            )

        const taxSchemeId =
            getElementText(
                getDirectChildByLocalName(
                    taxScheme,
                    'ID'
                )
            )

        if (taxSchemeId === 'VAT') {
            customer.vatIdentifier = companyId
        }
    }

    const postalAddress =
        getDirectChildByLocalName(
            party,
            'PostalAddress'
        )

    customer.address.streetName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'StreetName'
            )
        )

    customer.address.postalCode =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'PostalZone'
            )
        )

    customer.address.cityName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'CityName'
            )
        )

    const country =
        getDirectChildByLocalName(
            postalAddress,
            'Country'
        )

    customer.address.countryCode =
        getElementText(
            getDirectChildByLocalName(
                country,
                'IdentificationCode'
            )
        )

    return customer
}

function parseCiiCustomer(xmlDoc) {
    const customer = createEmptyCustomer()

    const buyerTradeParty =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'BuyerTradeParty'
        )[0]

    if (!buyerTradeParty) {
        return customer
    }

    customer.name =
        getElementText(
            getDirectChildByLocalName(
                buyerTradeParty,
                'Name'
            )
        )

    const legalOrganization =
        getDirectChildByLocalName(
            buyerTradeParty,
            'SpecifiedLegalOrganization'
        )

    customer.tradingName =
        getElementText(
            getDirectChildByLocalName(
                legalOrganization,
                'TradingBusinessName'
            )
        )

    const buyerIds = [
        ...getDirectChildrenByLocalName(
            buyerTradeParty,
            'ID'
        ),
        ...getDirectChildrenByLocalName(
            buyerTradeParty,
            'GlobalID'
        ),
    ]

    customer.identifiers = buyerIds
        .map(idElement => ({
            id: getElementText(idElement),
            schemeId: getElementAttribute(
                idElement,
                'schemeID'
            ),
        }))
        .filter(identifier => identifier.id !== null)

    const legalOrganizationId =
        getDirectChildByLocalName(
            legalOrganization,
            'ID'
        )

    customer.legalEntity.id =
        getElementText(legalOrganizationId)

    customer.legalEntity.schemeId =
        getElementAttribute(
            legalOrganizationId,
            'schemeID'
        )

    const taxRegistrations =
        getDirectChildrenByLocalName(
            buyerTradeParty,
            'SpecifiedTaxRegistration'
        )

    for (const taxRegistration of taxRegistrations) {
        const idElement =
            getDirectChildByLocalName(
                taxRegistration,
                'ID'
            )

        const identifier =
            getElementText(idElement)

        const schemeId =
            getElementAttribute(
                idElement,
                'schemeID'
            )

        if (schemeId === 'VA') {
            customer.vatIdentifier = identifier
        }
    }

    const postalAddress =
        getDirectChildByLocalName(
            buyerTradeParty,
            'PostalTradeAddress'
        )

    customer.address.streetName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'LineOne'
            )
        )

    customer.address.postalCode =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'PostcodeCode'
            )
        )

    customer.address.cityName =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'CityName'
            )
        )

    customer.address.countryCode =
        getElementText(
            getDirectChildByLocalName(
                postalAddress,
                'CountryID'
            )
        )

    return customer
}

function parsePayment(xmlDoc, syntax) {
    if (syntax === 'UBL') {
        return parseUblPayment(xmlDoc)
    }

    if (syntax === 'CII') {
        return parseCiiPayment(xmlDoc)
    }

    return createEmptyPayment()
}

function parseUblPayment(xmlDoc) {
    const payment = createEmptyPayment()

    const root =
        xmlDoc.documentElement

    // BT-9
    payment.dueDate =
        getElementText(
            getDirectChildByLocalName(
                root,
                'DueDate'
            )
        )

    // BT-20
    const paymentTerms =
        getDirectChildrenByLocalName(
            root,
            'PaymentTerms'
        )

    for (const term of paymentTerms) {
        const note =
            getElementText(
                getDirectChildByLocalName(
                    term,
                    'Note'
                )
            )

        if (note !== null) {
            payment.terms = note
            break
        }
    }

    // BT-90
    const accountingSupplierParty =
        getDirectChildByLocalName(
            root,
            'AccountingSupplierParty'
        )

    const supplierParty =
        getDirectChildByLocalName(
            accountingSupplierParty,
            'Party'
        )

    const payeeParty =
        getDirectChildByLocalName(
            root,
            'PayeeParty'
        )

    for (const party of [
        supplierParty,
        payeeParty,
    ]) {
        if (
            !party ||
            payment.creditorIdentifier !== null
        ) {
            continue
        }

        const partyIdentifications =
            getDirectChildrenByLocalName(
                party,
                'PartyIdentification'
            )

        for (
            const partyIdentification
            of partyIdentifications
        ) {
            const idElement =
                getDirectChildByLocalName(
                    partyIdentification,
                    'ID'
                )

            const schemeId =
                getElementAttribute(
                    idElement,
                    'schemeID'
                )

            if (schemeId === 'SEPA') {
                payment.creditorIdentifier =
                    getElementText(idElement)

                break
            }
        }
    }

    const paymentMeansList =
        getDirectChildrenByLocalName(
            root,
            'PaymentMeans'
        )

    if (paymentMeansList.length === 0) {
        return payment
    }

    const instruction =
        createEmptyPaymentInstruction()

    for (const paymentMeans of paymentMeansList) {
        const paymentMeansCode =
            getDirectChildByLocalName(
                paymentMeans,
                'PaymentMeansCode'
            )

        // BT-81
        instruction.typeCode =
            firstNonNull(
                instruction.typeCode,
                getElementText(
                    paymentMeansCode
                )
            )

        // BT-82
        instruction.text =
            firstNonNull(
                instruction.text,
                getElementAttribute(
                    paymentMeansCode,
                    'name'
                )
            )

        // BT-83
        instruction.remittanceInformation =
            firstNonNull(
                instruction.remittanceInformation,
                getElementText(
                    getDirectChildByLocalName(
                        paymentMeans,
                        'PaymentID'
                    )
                )
            )

        // BG-17 / BT-84..BT-86
        const account =
            getDirectChildByLocalName(
                paymentMeans,
                'PayeeFinancialAccount'
            )

        if (account) {
            const branch =
                getDirectChildByLocalName(
                    account,
                    'FinancialInstitutionBranch'
                )

            instruction.creditTransfers.push(
                createCreditTransfer(
                    getElementText(
                        getDirectChildByLocalName(
                            account,
                            'ID'
                        )
                    ),
                    getElementText(
                        getDirectChildByLocalName(
                            account,
                            'Name'
                        )
                    ),
                    getElementText(
                        getDirectChildByLocalName(
                            branch,
                            'ID'
                        )
                    )
                )
            )
        }

        // BG-18 / BT-87..BT-88
        if (instruction.card === null) {
            const cardAccount =
                getDirectChildByLocalName(
                    paymentMeans,
                    'CardAccount'
                )

            if (cardAccount) {
                instruction.card = {
                    primaryAccountNumber:
                        getElementText(
                            getDirectChildByLocalName(
                                cardAccount,
                                'PrimaryAccountNumberID'
                            )
                        ),

                    holderName:
                        getElementText(
                            getDirectChildByLocalName(
                                cardAccount,
                                'HolderName'
                            )
                        ),
                }
            }
        }

        // BG-19 / BT-89 + BT-91
        if (instruction.directDebit === null) {
            const paymentMandate =
                getDirectChildByLocalName(
                    paymentMeans,
                    'PaymentMandate'
                )

            if (paymentMandate) {
                const payerFinancialAccount =
                    getDirectChildByLocalName(
                        paymentMandate,
                        'PayerFinancialAccount'
                    )

                instruction.directDebit = {
                    mandateReference:
                        getElementText(
                            getDirectChildByLocalName(
                                paymentMandate,
                                'ID'
                            )
                        ),

                    debitedAccountId:
                        getElementText(
                            getDirectChildByLocalName(
                                payerFinancialAccount,
                                'ID'
                            )
                        ),
                }
            }
        }
    }

    payment.instruction = instruction

    return payment
}

function parseCiiPayment(xmlDoc) {
    const payment = createEmptyPayment()

    const applicableHeaderTradeSettlement =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'ApplicableHeaderTradeSettlement'
        )[0]

    if (!applicableHeaderTradeSettlement) {
        return payment
    }

    // BT-90
    payment.creditorIdentifier =
        getElementText(
            getDirectChildByLocalName(
                applicableHeaderTradeSettlement,
                'CreditorReferenceID'
            )
        )

    const paymentTerms =
        getDirectChildrenByLocalName(
            applicableHeaderTradeSettlement,
            'SpecifiedTradePaymentTerms'
        )

    let mandateReference = null

    for (const paymentTerm of paymentTerms) {

        // BT-20
        if (payment.terms === null) {
            payment.terms =
                getElementText(
                    getDirectChildByLocalName(
                        paymentTerm,
                        'Description'
                    )
                )
        }

        // BT-9
        if (payment.dueDate === null) {
            const dueDateDateTime =
                getDirectChildByLocalName(
                    paymentTerm,
                    'DueDateDateTime'
                )

            const dateTimeString =
                getDirectChildByLocalName(
                    dueDateDateTime,
                    'DateTimeString'
                )

            payment.dueDate =
                normalizeCiiDateTimeString(
                    dateTimeString
                )
        }

        // BT-89
        if (mandateReference === null) {
            mandateReference =
                getElementText(
                    getDirectChildByLocalName(
                        paymentTerm,
                        'DirectDebitMandateID'
                    )
                )
        }
    }

    // BT-83
    const paymentReference =
        getElementText(
            getDirectChildByLocalName(
                applicableHeaderTradeSettlement,
                'PaymentReference'
            )
        )

    const paymentMeansList =
        getDirectChildrenByLocalName(
            applicableHeaderTradeSettlement,
            'SpecifiedTradeSettlementPaymentMeans'
        )

    if (paymentMeansList.length === 0) {
        return payment
    }

    const instruction =
        createEmptyPaymentInstruction()

    for (const paymentMeans of paymentMeansList) {

        // BT-81
        instruction.typeCode =
            firstNonNull(
                instruction.typeCode,
                getElementText(
                    getDirectChildByLocalName(
                        paymentMeans,
                        'TypeCode'
                    )
                )
            )

        // BT-82
        instruction.text =
            firstNonNull(
                instruction.text,
                getElementText(
                    getDirectChildByLocalName(
                        paymentMeans,
                        'Information'
                    )
                )
            )

        // BT-83
        instruction.remittanceInformation =
            firstNonNull(
                instruction.remittanceInformation,
                paymentReference
            )

        // BG-17 / BT-84..BT-86
        const creditorAccount =
            getDirectChildByLocalName(
                paymentMeans,
                'PayeePartyCreditorFinancialAccount'
            )

        const creditorInstitution =
            getDirectChildByLocalName(
                paymentMeans,
                'PayeeSpecifiedCreditorFinancialInstitution'
            )

        if (
            creditorAccount ||
            creditorInstitution
        ) {
            instruction.creditTransfers.push(
                createCreditTransfer(
                    getElementText(
                        getDirectChildByLocalName(
                            creditorAccount,
                            'IBANID'
                        )
                    ) ??
                    getElementText(
                        getDirectChildByLocalName(
                            creditorAccount,
                            'ProprietaryID'
                        )
                    ),

                    getElementText(
                        getDirectChildByLocalName(
                            creditorAccount,
                            'AccountName'
                        )
                    ),

                    getElementText(
                        getDirectChildByLocalName(
                            creditorInstitution,
                            'BICID'
                        )
                    )
                )
            )
        }

        // BG-18 / BT-87..BT-88
        if (instruction.card === null) {
            const financialCard =
                getDirectChildByLocalName(
                    paymentMeans,
                    'ApplicableTradeSettlementFinancialCard'
                )

            if (financialCard) {
                instruction.card = {
                    primaryAccountNumber:
                        getElementText(
                            getDirectChildByLocalName(
                                financialCard,
                                'ID'
                            )
                        ),

                    holderName:
                        getElementText(
                            getDirectChildByLocalName(
                                financialCard,
                                'CardholderName'
                            )
                        ),
                }
            }
        }

        // BG-19 / BT-89 + BT-91
        if (instruction.directDebit === null) {
            const debtorAccount =
                getDirectChildByLocalName(
                    paymentMeans,
                    'PayerPartyDebtorFinancialAccount'
                )

            if (
                debtorAccount ||
                mandateReference !== null
            ) {
                instruction.directDebit = {
                    mandateReference,

                    debitedAccountId:
                        getElementText(
                            getDirectChildByLocalName(
                                debtorAccount,
                                'IBANID'
                            )
                        ) ??
                        getElementText(
                            getDirectChildByLocalName(
                                debtorAccount,
                                'ProprietaryID'
                            )
                        ),
                }
            }
        }
    }

    payment.instruction = instruction

    return payment
}

function parseAllowancesCharges(xmlDoc, syntax) {
    if (syntax === 'UBL') {
        return parseUblAllowancesCharges(xmlDoc)
    }

    if (syntax === 'CII') {
        return parseCiiAllowancesCharges(xmlDoc)
    }

    return {
        documentLevel: [],
        lineLevel: [],
    }
}

function parseUblAllowanceCharge(element) {
    const chargeIndicator =
        getElementText(
            getDirectChildByLocalName(
                element,
                'ChargeIndicator'
            )
        )

    const taxCategory =
        getDirectChildByLocalName(
            element,
            'TaxCategory'
        )

    return {
        type:
            chargeIndicator === 'true'
                ? 'charge'
                : 'allowance',

        reasonCode:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'AllowanceChargeReasonCode'
                )
            ),

        reason:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'AllowanceChargeReason'
                )
            ),

        amount:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'Amount'
                )
            ),

        baseAmount:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'BaseAmount'
                )
            ),

        percentage:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'MultiplierFactorNumeric'
                )
            ),

        vat: {
            categoryCode:
                getElementText(
                    getDirectChildByLocalName(
                        taxCategory,
                        'ID'
                    )
                ),

            rate:
                getElementText(
                    getDirectChildByLocalName(
                        taxCategory,
                        'Percent'
                    )
                ),
        },
    }
}

function parseUblAllowancesCharges(xmlDoc) {
    const root =
        xmlDoc.documentElement

    if (!root) {
        return {
            documentLevel: [],
            lineLevel: [],
        }
    }

    const documentLevel =
        getDirectChildrenByLocalName(
            root,
            'AllowanceCharge'
        ).map(
            parseUblAllowanceCharge
        )

    const lineElementName =
        root.localName === 'CreditNote'
            ? 'CreditNoteLine'
            : 'InvoiceLine'

    const lineLevel = []

    const lineElements =
        getDirectChildrenByLocalName(
            root,
            lineElementName
        )

    for (const line of lineElements) {
        const lineId =
            getElementText(
                getDirectChildByLocalName(
                    line,
                    'ID'
                )
            )

        const allowanceCharges =
            getDirectChildrenByLocalName(
                line,
                'AllowanceCharge'
            )

        for (const allowanceCharge of allowanceCharges) {
            lineLevel.push({
                lineId,
                ...parseUblAllowanceCharge(
                    allowanceCharge
                ),
            })
        }
    }

    return {
        documentLevel,
        lineLevel,
    }
}

function getCiiChargeIndicatorValue(allowanceCharge) {
    const chargeIndicator =
        getDirectChildByLocalName(
            allowanceCharge,
            'ChargeIndicator'
        )

    return (
        getElementText(
            getDirectChildByLocalName(
                chargeIndicator,
                'Indicator'
            )
        ) ??
        getElementText(
            chargeIndicator
        )
    )
}

function parseCiiAllowanceCharge(
    element,
    includeVat
) {
    const type =
        getCiiChargeIndicatorValue(
            element
        ) === 'true'
            ? 'charge'
            : 'allowance'

    const taxCategory =
        includeVat
            ? getDirectChildByLocalName(
                element,
                'CategoryTradeTax'
            )
            : null

    return {
        type,

        reasonCode:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'ReasonCode'
                )
            ),

        reason:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'Reason'
                )
            ),

        amount:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'ActualAmount'
                )
            ),

        baseAmount:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'BasisAmount'
                )
            ),

        percentage:
            getElementText(
                getDirectChildByLocalName(
                    element,
                    'CalculationPercent'
                )
            ),

        vat: {
            categoryCode:
                getElementText(
                    getDirectChildByLocalName(
                        taxCategory,
                        'CategoryCode'
                    )
                ),

            rate:
                getElementText(
                    getDirectChildByLocalName(
                        taxCategory,
                        'RateApplicablePercent'
                    )
                ),
        },
    }
}

function parseCiiAllowancesCharges(xmlDoc) {
    const transaction =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'SupplyChainTradeTransaction'
        )[0]

    if (!transaction) {
        return {
            documentLevel: [],
            lineLevel: [],
        }
    }

    const settlement =
        getDirectChildByLocalName(
            transaction,
            'ApplicableHeaderTradeSettlement'
        )

    const documentLevel =
        getDirectChildrenByLocalName(
            settlement,
            'SpecifiedTradeAllowanceCharge'
        ).map(
            element =>
                parseCiiAllowanceCharge(
                    element,
                    true
                )
        )

    const lineLevel = []

    const lineElements =
        getDirectChildrenByLocalName(
            transaction,
            'IncludedSupplyChainTradeLineItem'
        )

    for (const line of lineElements) {
        const associatedDocument =
            getDirectChildByLocalName(
                line,
                'AssociatedDocumentLineDocument'
            )

        const lineId =
            getElementText(
                getDirectChildByLocalName(
                    associatedDocument,
                    'LineID'
                )
            )

        const lineSettlement =
            getDirectChildByLocalName(
                line,
                'SpecifiedLineTradeSettlement'
            )

        const allowanceCharges =
            getDirectChildrenByLocalName(
                lineSettlement,
                'SpecifiedTradeAllowanceCharge'
            )

        for (const allowanceCharge of allowanceCharges) {
            lineLevel.push({
                lineId,
                ...parseCiiAllowanceCharge(
                    allowanceCharge,
                    false
                ),
            })
        }
    }

    return {
        documentLevel,
        lineLevel,
    }
}

function parseInvoiceLines(xmlDoc, syntax) {
    if (syntax === 'UBL') {
        return parseUblInvoiceLines(xmlDoc)
    }

    if (syntax === 'CII') {
        return parseCiiInvoiceLines(xmlDoc)
    }

    return []
}

function parseUblInvoiceLines(xmlDoc) {
    const root =
        xmlDoc.documentElement

    if (!root) {
        return []
    }

    const lineElementName =
        root.localName === 'CreditNote'
            ? 'CreditNoteLine'
            : 'InvoiceLine'

    const quantityElementName =
        root.localName === 'CreditNote'
            ? 'CreditedQuantity'
            : 'InvoicedQuantity'

    const invoiceLines = []

    const lineElements =
        getDirectChildrenByLocalName(
            root,
            lineElementName
        )

    for (const line of lineElements) {
        const quantityElement =
            getDirectChildByLocalName(
                line,
                quantityElementName
            )

        const priceElement =
            getDirectChildByLocalName(
                line,
                'Price'
            )

        let priceAllowanceCharge = null

        const priceAllowanceCharges =
            getDirectChildrenByLocalName(
                priceElement,
                'AllowanceCharge'
            )

        for (const allowanceCharge of priceAllowanceCharges) {
            const chargeIndicator =
                getElementText(
                    getDirectChildByLocalName(
                        allowanceCharge,
                        'ChargeIndicator'
                    )
                )

            if (chargeIndicator === 'false') {
                priceAllowanceCharge =
                    allowanceCharge
                break
            }
        }

        const itemElement =
            getDirectChildByLocalName(
                line,
                'Item'
            )

        const classifiedTaxCategory =
            getDirectChildByLocalName(
                itemElement,
                'ClassifiedTaxCategory'
            )

        const standardIdentification =
            getDirectChildByLocalName(
                itemElement,
                'StandardItemIdentification'
            )

        const standardIdElement =
            getDirectChildByLocalName(
                standardIdentification,
                'ID'
            )

        const classifications = []

        const commodityClassifications =
            getDirectChildrenByLocalName(
                itemElement,
                'CommodityClassification'
            )

        for (const classification of commodityClassifications) {
            const classificationCode =
                getDirectChildByLocalName(
                    classification,
                    'ItemClassificationCode'
                )

            classifications.push({
                id:
                    getElementText(
                        classificationCode
                    ),

                schemeId:
                    getAttributeOrNull(
                        classificationCode,
                        'listID'
                    ),

                schemeVersionId:
                    getAttributeOrNull(
                        classificationCode,
                        'listVersionID'
                    ),
            })
        }

        const attributes = []

        const additionalItemProperties =
            getDirectChildrenByLocalName(
                itemElement,
                'AdditionalItemProperty'
            )

        for (const property of additionalItemProperties) {
            attributes.push({
                name:
                    getElementText(
                        getDirectChildByLocalName(
                            property,
                            'Name'
                        )
                    ),

                value:
                    getElementText(
                        getDirectChildByLocalName(
                            property,
                            'Value'
                        )
                    ),
            })
        }

        const baseQuantityElement =
            getDirectChildByLocalName(
                priceElement,
                'BaseQuantity'
            )

        invoiceLines.push({
            id:
                getElementText(
                    getDirectChildByLocalName(
                        line,
                        'ID'
                    )
                ),

            note:
                getElementText(
                    getDirectChildByLocalName(
                        line,
                        'Note'
                    )
                ),

            quantity:
                getElementText(
                    quantityElement
                ),

            unitCode:
                getAttributeOrNull(
                    quantityElement,
                    'unitCode'
                ),

            netAmount:
                getElementText(
                    getDirectChildByLocalName(
                        line,
                        'LineExtensionAmount'
                    )
                ),

            price: {
                netAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            priceElement,
                            'PriceAmount'
                        )
                    ),

                baseQuantity:
                    getElementText(
                        baseQuantityElement
                    ),

                baseQuantityUnitCode:
                    getAttributeOrNull(
                        baseQuantityElement,
                        'unitCode'
                    ),

                grossAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            priceAllowanceCharge,
                            'BaseAmount'
                        )
                    ),

                discountAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            priceAllowanceCharge,
                            'Amount'
                        )
                    ),
            },

            vat: {
                categoryCode:
                    getElementText(
                        getDirectChildByLocalName(
                            classifiedTaxCategory,
                            'ID'
                        )
                    ),

                rate:
                    getElementText(
                        getDirectChildByLocalName(
                            classifiedTaxCategory,
                            'Percent'
                        )
                    ),
            },

            item: {
                name:
                    getElementText(
                        getDirectChildByLocalName(
                            itemElement,
                            'Name'
                        )
                    ),

                description:
                    getElementText(
                        getDirectChildByLocalName(
                            itemElement,
                            'Description'
                        )
                    ),

                sellerIdentifier:
                    getElementText(
                        getDirectChildByLocalName(
                            getDirectChildByLocalName(
                                itemElement,
                                'SellersItemIdentification'
                            ),
                            'ID'
                        )
                    ),

                buyerIdentifier:
                    getElementText(
                        getDirectChildByLocalName(
                            getDirectChildByLocalName(
                                itemElement,
                                'BuyersItemIdentification'
                            ),
                            'ID'
                        )
                    ),

                standardIdentifier: {
                    id:
                        getElementText(
                            standardIdElement
                        ),

                    schemeId:
                        getAttributeOrNull(
                            standardIdElement,
                            'schemeID'
                        ),
                },

                classifications,

                countryOfOrigin:
                    getElementText(
                        getDirectChildByLocalName(
                            getDirectChildByLocalName(
                                itemElement,
                                'OriginCountry'
                            ),
                            'IdentificationCode'
                        )
                    ),

                attributes,
            },
        })
    }

    return invoiceLines
}

function parseCiiInvoiceLines(xmlDoc) {
    const transaction =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'SupplyChainTradeTransaction'
        )[0]

    if (!transaction) {
        return []
    }

    const invoiceLines = []

    const lineElements =
        getDirectChildrenByLocalName(
            transaction,
            'IncludedSupplyChainTradeLineItem'
        )

    for (const line of lineElements) {
        const associatedDocument =
            getDirectChildByLocalName(
                line,
                'AssociatedDocumentLineDocument'
            )

        const includedNote =
            getDirectChildByLocalName(
                associatedDocument,
                'IncludedNote'
            )

        const product =
            getDirectChildByLocalName(
                line,
                'SpecifiedTradeProduct'
            )

        const agreement =
            getDirectChildByLocalName(
                line,
                'SpecifiedLineTradeAgreement'
            )

        const delivery =
            getDirectChildByLocalName(
                line,
                'SpecifiedLineTradeDelivery'
            )

        const settlement =
            getDirectChildByLocalName(
                line,
                'SpecifiedLineTradeSettlement'
            )

        const quantityElement =
            getDirectChildByLocalName(
                delivery,
                'BilledQuantity'
            )

        const netPrice =
            getDirectChildByLocalName(
                agreement,
                'NetPriceProductTradePrice'
            )

        const grossPrice =
            getDirectChildByLocalName(
                agreement,
                'GrossPriceProductTradePrice'
            )

        let grossAllowance = null

        const grossPriceAllowanceCharges =
            getDirectChildrenByLocalName(
                grossPrice,
                'AppliedTradeAllowanceCharge'
            )

        for (const allowanceCharge of grossPriceAllowanceCharges) {
            const chargeIndicator =
                getDirectChildByLocalName(
                    allowanceCharge,
                    'ChargeIndicator'
                )

            const indicatorElement =
                getDirectChildByLocalName(
                    chargeIndicator,
                    'Indicator'
                )

            const indicatorValue =
                getElementText(
                    indicatorElement
                ) ??
                getElementText(
                    chargeIndicator
                )

            if (indicatorValue === 'false') {
                grossAllowance =
                    allowanceCharge
                break
            }
        }

        let vatTax = null

        const applicableTradeTaxes =
            getDirectChildrenByLocalName(
                settlement,
                'ApplicableTradeTax'
            )

        for (const tradeTax of applicableTradeTaxes) {
            const typeCode =
                getElementText(
                    getDirectChildByLocalName(
                        tradeTax,
                        'TypeCode'
                    )
                )

            if (
                typeCode === null ||
                typeCode.toUpperCase() === 'VAT'
            ) {
                vatTax =
                    tradeTax
                break
            }
        }

        const lineSummation =
            getDirectChildByLocalName(
                settlement,
                'SpecifiedTradeSettlementLineMonetarySummation'
            )

        const globalId =
            getDirectChildByLocalName(
                product,
                'GlobalID'
            )

        const classifications = []

        const productClassifications =
            getDirectChildrenByLocalName(
                product,
                'DesignatedProductClassification'
            )

        for (const classification of productClassifications) {
            const classCode =
                getDirectChildByLocalName(
                    classification,
                    'ClassCode'
                )

            classifications.push({
                id:
                    getElementText(
                        classCode
                    ),

                schemeId:
                    getAttributeOrNull(
                        classCode,
                        'listID'
                    ),

                schemeVersionId:
                    getAttributeOrNull(
                        classCode,
                        'listVersionID'
                    ),
            })
        }

        const attributes = []

        const productCharacteristics =
            getDirectChildrenByLocalName(
                product,
                'ApplicableProductCharacteristic'
            )

        for (const characteristic of productCharacteristics) {
            attributes.push({
                name:
                    getElementText(
                        getDirectChildByLocalName(
                            characteristic,
                            'Description'
                        )
                    ),

                value:
                    getElementText(
                        getDirectChildByLocalName(
                            characteristic,
                            'Value'
                        )
                    ),
            })
        }

        const basisQuantity =
            getDirectChildByLocalName(
                netPrice,
                'BasisQuantity'
            )

        invoiceLines.push({
            id:
                getElementText(
                    getDirectChildByLocalName(
                        associatedDocument,
                        'LineID'
                    )
                ),

            note:
                getElementText(
                    getDirectChildByLocalName(
                        includedNote,
                        'Content'
                    )
                ),

            quantity:
                getElementText(
                    quantityElement
                ),

            unitCode:
                getAttributeOrNull(
                    quantityElement,
                    'unitCode'
                ),

            netAmount:
                getElementText(
                    getDirectChildByLocalName(
                        lineSummation,
                        'LineTotalAmount'
                    )
                ),

            price: {
                netAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            netPrice,
                            'ChargeAmount'
                        )
                    ),

                baseQuantity:
                    getElementText(
                        basisQuantity
                    ),

                baseQuantityUnitCode:
                    getAttributeOrNull(
                        basisQuantity,
                        'unitCode'
                    ),

                grossAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            grossPrice,
                            'ChargeAmount'
                        )
                    ),

                discountAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            grossAllowance,
                            'ActualAmount'
                        )
                    ),
            },

            vat: {
                categoryCode:
                    getElementText(
                        getDirectChildByLocalName(
                            vatTax,
                            'CategoryCode'
                        )
                    ),

                rate:
                    getElementText(
                        getDirectChildByLocalName(
                            vatTax,
                            'RateApplicablePercent'
                        )
                    ),
            },

            item: {
                name:
                    getElementText(
                        getDirectChildByLocalName(
                            product,
                            'Name'
                        )
                    ),

                description:
                    getElementText(
                        getDirectChildByLocalName(
                            product,
                            'Description'
                        )
                    ),

                sellerIdentifier:
                    getElementText(
                        getDirectChildByLocalName(
                            product,
                            'SellerAssignedID'
                        )
                    ),

                buyerIdentifier:
                    getElementText(
                        getDirectChildByLocalName(
                            product,
                            'BuyerAssignedID'
                        )
                    ),

                standardIdentifier: {
                    id:
                        getElementText(
                            globalId
                        ),

                    schemeId:
                        getAttributeOrNull(
                            globalId,
                            'schemeID'
                        ),
                },

                classifications,

                countryOfOrigin:
                    getElementText(
                        getDirectChildByLocalName(
                            getDirectChildByLocalName(
                                product,
                                'OriginTradeCountry'
                            ),
                            'ID'
                        )
                    ),

                attributes,
            },
        })
    }

    return invoiceLines
}

function parseVatBreakdown(xmlDoc, syntax) {
    if (syntax === 'UBL') {
        return parseUblVatBreakdown(xmlDoc)
    }

    if (syntax === 'CII') {
        return parseCiiVatBreakdown(xmlDoc)
    }

    return []
}

function parseUblVatBreakdown(xmlDoc) {
    const root =
        xmlDoc.documentElement

    if (!root) {
        return []
    }

    const vatBreakdown = []

    const taxTotals =
        getDirectChildrenByLocalName(
            root,
            'TaxTotal'
        )

    for (const taxTotal of taxTotals) {
        const taxSubtotals =
            getDirectChildrenByLocalName(
                taxTotal,
                'TaxSubtotal'
            )

        for (const taxSubtotal of taxSubtotals) {
            const taxCategory =
                getDirectChildByLocalName(
                    taxSubtotal,
                    'TaxCategory'
                )

            if (!taxCategory) {
                continue
            }

            const taxScheme =
                getDirectChildByLocalName(
                    taxCategory,
                    'TaxScheme'
                )

            const taxSchemeId =
                getElementText(
                    getDirectChildByLocalName(
                        taxScheme,
                        'ID'
                    )
                )

            if (
                taxSchemeId !== null &&
                taxSchemeId.toUpperCase() !== 'VAT'
            ) {
                continue
            }

            vatBreakdown.push({
                taxableAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            taxSubtotal,
                            'TaxableAmount'
                        )
                    ),

                taxAmount:
                    getElementText(
                        getDirectChildByLocalName(
                            taxSubtotal,
                            'TaxAmount'
                        )
                    ),

                categoryCode:
                    getElementText(
                        getDirectChildByLocalName(
                            taxCategory,
                            'ID'
                        )
                    ),

                rate:
                    getElementText(
                        getDirectChildByLocalName(
                            taxCategory,
                            'Percent'
                        )
                    ),

                exemptionReason:
                    getElementText(
                        getDirectChildByLocalName(
                            taxCategory,
                            'TaxExemptionReason'
                        )
                    ),

                exemptionReasonCode:
                    getElementText(
                        getDirectChildByLocalName(
                            taxCategory,
                            'TaxExemptionReasonCode'
                        )
                    ),
            })
        }
    }

    return vatBreakdown
}

function parseCiiVatBreakdown(xmlDoc) {
    const transaction =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'SupplyChainTradeTransaction'
        )[0]

    const settlement =
        getDirectChildByLocalName(
            transaction,
            'ApplicableHeaderTradeSettlement'
        )

    if (!settlement) {
        return []
    }

    const vatBreakdown = []

    const tradeTaxes =
        getDirectChildrenByLocalName(
            settlement,
            'ApplicableTradeTax'
        )

    for (const tradeTax of tradeTaxes) {
        const typeCode =
            getElementText(
                getDirectChildByLocalName(
                    tradeTax,
                    'TypeCode'
                )
            )

        if (
            typeCode !== null &&
            typeCode.toUpperCase() !== 'VAT'
        ) {
            continue
        }

        vatBreakdown.push({
            taxableAmount:
                getElementText(
                    getDirectChildByLocalName(
                        tradeTax,
                        'BasisAmount'
                    )
                ),

            taxAmount:
                getElementText(
                    getDirectChildByLocalName(
                        tradeTax,
                        'CalculatedAmount'
                    )
                ),

            categoryCode:
                getElementText(
                    getDirectChildByLocalName(
                        tradeTax,
                        'CategoryCode'
                    )
                ),

            rate:
                getElementText(
                    getDirectChildByLocalName(
                        tradeTax,
                        'RateApplicablePercent'
                    )
                ),

            exemptionReason:
                getElementText(
                    getDirectChildByLocalName(
                        tradeTax,
                        'ExemptionReason'
                    )
                ),

            exemptionReasonCode:
                getElementText(
                    getDirectChildByLocalName(
                        tradeTax,
                        'ExemptionReasonCode'
                    )
                ),
        })
    }

    return vatBreakdown
}

function parseMonetaryData(xmlDoc, syntax) {
    if (syntax === 'UBL') {
        return parseUblMonetaryData(xmlDoc)
    }

    if (syntax === 'CII') {
        return parseCiiMonetaryData(xmlDoc)
    }

    return {
        currencyCode: null,
        totals: createEmptyTotals(),
    }
}

function parseUblMonetaryData(xmlDoc) {
    const root =
        xmlDoc.documentElement

    const currencyCode =
        getElementText(
            getDirectChildByLocalName(
                root,
                'DocumentCurrencyCode'
            )
        )

    const totals =
        createEmptyTotals()

    const legalMonetaryTotal =
        getDirectChildByLocalName(
            root,
            'LegalMonetaryTotal'
        )

    if (legalMonetaryTotal) {
        totals.lineNetAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'LineExtensionAmount'
                )
            )

        totals.allowanceAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'AllowanceTotalAmount'
                )
            )

        totals.chargeAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'ChargeTotalAmount'
                )
            )

        totals.taxExclusiveAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'TaxExclusiveAmount'
                )
            )

        totals.taxInclusiveAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'TaxInclusiveAmount'
                )
            )

        totals.paidAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'PrepaidAmount'
                )
            )

        totals.roundingAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'PayableRoundingAmount'
                )
            )

        totals.payableAmount =
            getElementText(
                getDirectChildByLocalName(
                    legalMonetaryTotal,
                    'PayableAmount'
                )
            )
    }

    // BT-110
    const taxTotals =
        getDirectChildrenByLocalName(
            root,
            'TaxTotal'
        )

    for (const taxTotal of taxTotals) {
        const taxAmount =
            getDirectChildByLocalName(
                taxTotal,
                'TaxAmount'
            )

        if (!taxAmount) {
            continue
        }

        const taxCurrency =
            getElementAttribute(
                taxAmount,
                'currencyID'
            )

        if (
            currencyCode === null ||
            taxCurrency === currencyCode
        ) {
            totals.taxAmount =
                getElementText(taxAmount)

            break
        }
    }

    return {
        currencyCode,
        totals,
    }
}

function parseCiiMonetaryData(xmlDoc) {
    const totals =
        createEmptyTotals()

    const settlement =
        xmlDoc.getElementsByTagNameNS(
            '*',
            'ApplicableHeaderTradeSettlement'
        )[0]

    if (!settlement) {
        return {
            currencyCode: null,
            totals,
        }
    }

    const currencyCode =
        getElementText(
            getDirectChildByLocalName(
                settlement,
                'InvoiceCurrencyCode'
            )
        )

    const summation =
        getDirectChildByLocalName(
            settlement,
            'SpecifiedTradeSettlementHeaderMonetarySummation'
        )

    if (!summation) {
        return {
            currencyCode,
            totals,
        }
    }

    totals.lineNetAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'LineTotalAmount'
            )
        )

    totals.allowanceAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'AllowanceTotalAmount'
            )
        )

    totals.chargeAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'ChargeTotalAmount'
            )
        )

    totals.taxExclusiveAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'TaxBasisTotalAmount'
            )
        )

    // BT-110
    const taxTotalAmounts =
        getDirectChildrenByLocalName(
            summation,
            'TaxTotalAmount'
        )

    for (const taxTotalAmount of taxTotalAmounts) {
        const taxCurrency =
            getElementAttribute(
                taxTotalAmount,
                'currencyID'
            )

        if (taxCurrency === currencyCode) {
            totals.taxAmount =
                getElementText(taxTotalAmount)

            break
        }
    }

    totals.taxInclusiveAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'GrandTotalAmount'
            )
        )

    totals.paidAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'TotalPrepaidAmount'
            )
        )

    totals.roundingAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'RoundingAmount'
            )
        )

    totals.payableAmount =
        getElementText(
            getDirectChildByLocalName(
                summation,
                'DuePayableAmount'
            )
        )

    return {
        currencyCode,
        totals,
    }
}

function parseDocument(xmlDoc) {

    const documentInfo =
        detectDocument(xmlDoc)

    const monetaryData =
        parseMonetaryData(
            xmlDoc,
            documentInfo.syntax
        )

    return {

        syntax:
            documentInfo.syntax,

        rootElement:
            documentInfo.rootName,

        documentCode:
            getDocumentCode(
                xmlDoc,
                documentInfo.syntax
            ),

        documentLabel:
            getDocumentLabel(
                getDocumentCode(
                    xmlDoc,
                    documentInfo.syntax
                )
            ),

        documentNumber:
            getDocumentNumber(
                xmlDoc,
                documentInfo.syntax
            ),

        issueDate:
            getIssueDate(
                xmlDoc,
                documentInfo.syntax
            ),

        currencyCode:
            monetaryData.currencyCode,

        supplier:
            parseSupplier(
                xmlDoc,
                documentInfo.syntax
            ),

        customer:
            parseCustomer(
                xmlDoc,
                documentInfo.syntax
            ),

        payment:
            parsePayment(
                xmlDoc,
                documentInfo.syntax
            ),

        totals:
            monetaryData.totals,

        invoiceLines:
            parseInvoiceLines(
                xmlDoc,
                documentInfo.syntax
            ),

        allowancesCharges:
            parseAllowancesCharges(
                xmlDoc,
                documentInfo.syntax
            ),

        vatBreakdown:
            parseVatBreakdown(
                xmlDoc,
                documentInfo.syntax
            )
    }
}

function getDocumentLabel(documentCode) {

    switch (documentCode) {

        case '380':
            return 'Invoice'

        case '381':
            return 'Credit Note'

        case '384':
            return 'Corrective Invoice'

        case '389':
            return 'Self-Billing Invoice'

        default:
            return 'Document'
    }
}

function showXmlDocument(xmlText, viewer, fileName, requireCii = false) {
    const xmlDoc = new DOMParser().parseFromString(
        xmlText,
        'application/xml'
    )

    if (
        !xmlDoc.documentElement ||
        xmlDoc.getElementsByTagName('parsererror').length > 0
    ) {
        viewer.showError(
            'Malformed XML',
            'The selected file is not a well-formed XML document.'
        )
        return true
    }

    const syntax = detectDocument(xmlDoc).syntax
    if (syntax === 'UNKNOWN' || (requireCii && syntax !== 'CII')) {
        viewer.showError(
            'Unsupported document',
            'This XML root is not supported by the UBL/CII viewer.'
        )
        return true
    }

    const invoice = parseDocument(xmlDoc)
    if (!['380', '381', '384', '389'].includes(invoice.documentCode)) {
        const code = invoice.documentCode
        viewer.showError(
            'Unsupported document',
            code !== null &&
            code !== undefined &&
            String(code).trim() !== ''
                ? `Document code ${code} is not supported.`
                : 'The document does not contain a supported invoice code.'
        )
        return true
    }

    viewer.showDocument(invoice, { fileName })
}

registerFileAction({
    id: 'ublcii-test',

    displayName: () => 'UBL/CII Viewer',

    default: DefaultType.DEFAULT,
    order: -10,

    enabled: (ctx) => {
        if (!ctx?.nodes || ctx.nodes.length !== 1) {
            return false
        }

        const node = ctx.nodes[0]
        if (node.type === 'folder') {
            return false
        }

        const fileName = node.basename || node.displayname || ''
        const mime = (node.mime || '').toLowerCase()

        if (/\.pdf$/i.test(fileName) || mime === 'application/pdf') {
            return false
        }

        return /\.xml$/i.test(fileName) ||
            mime === 'application/xml' ||
            mime === 'text/xml'
    },

    iconSvgInline: () => `
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 2h7l3 3v9H3z"/>
            </svg>
            `,

    async exec(ctx) {
        const node = ctx?.nodes?.[0]
        const fileName = node?.basename || node?.displayname || ''
        const viewer = openViewer(document.activeElement)

        if (!node?.source) {
            viewer.showError(
                'Unable to load document',
                'The selected file does not provide a readable source.'
            )
            return true
        }

        try {
            const response = await fetch(node.source, {
                credentials: 'same-origin',
            })

            if (!response.ok) {
                viewer.showError(
                    'Unable to load document',
                    `The XML file could not be loaded (HTTP ${response.status}).`
                )
                return true
            }

            const xmlText = await response.text()
            showXmlDocument(xmlText, viewer, fileName)
        }
        catch (error) {
            viewer.showError(
                'Unable to load document',
                'The XML file could not be loaded. Please try again.'
            )
        }

        return true
    },
})

// PDF is a separate, non-default action: keep Nextcloud's PDF viewer unchanged.
registerFileAction({
    id: 'ublcii-pdf',
    displayName: () => 'UBL/CII Viewer (embedded XML)',
    enabled: (ctx) => {
        if (ctx?.nodes?.length !== 1 || !document.head.dataset.user) return false
        const node = ctx.nodes[0]
        if (node.type === 'folder' || !node.root?.startsWith('/files/')) return false
        return !!node.id && (/\.pdf$/i.test(node.basename || node.displayname || '') ||
            (node.mime || '').toLowerCase() === 'application/pdf')
    },
    iconSvgInline: () => '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M3 2h7l3 3v9H3z"/></svg>',
    async exec(ctx) {
        const node = ctx?.nodes?.[0]
        const viewer = openViewer(document.activeElement)
        try {
            const fileId = node?.id
            if (!fileId || !/^[1-9][0-9]*$/.test(String(fileId))) {
                viewer.showError('Unable to load document', 'The selected file does not provide a readable file identifier.')
                return true
            }
            const response = await fetch(generateUrl('/apps/files_ublcii_viewer/pdf/extract'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    requesttoken: globalThis._nc_auth_requestToken || document.head.dataset.requesttoken || '',
                },
                body: JSON.stringify({ fileId: String(fileId) }),
            })
            if (!response.ok) {
                const error = await response.json().catch(() => null)
                viewer.showError('Unable to extract invoice XML',
                    typeof error?.code === 'string' && typeof error?.message === 'string'
                        ? error.message : 'The PDF could not be read or extracted.')
                return true
            }
            showXmlDocument(await response.text(), viewer, node.basename || node.displayname || '', true)
        } catch (error) {
            viewer.showError('Unable to load document', 'The PDF could not be loaded. Please try again.')
        }
        return true
    },
})
