const dynamoTablesDevR = {

    banners: {
        idName: "banners",
        tableName: "banners"
    },
    contact: {
        idName: "contact",
        tableName: "contact"
    },
    originDestination: {
        idName: "origin destination",
        tableName: "origin_destination"
    },
    permissions: {
        idName: "permissions",
        tableName: "permissions"
    },
    postalCode: {
        idName: "postal code",
        tableName: "postal_code"
    },
    quotation: {
        idName: "quotation",
        tableName: "quotation"
    },
    rates: {
        idName: "rates",
        tableName: "rates"
    },
    service: {
        idName: "service",
        tableName: "service"
    },
    subService: {
        idName: "sub service",
        tableName: "subservice"
    },
    textWeb: {
        idName: "text web",
        tableName: "text_web"
    },
    traking: {
        idName: "tracking",
        tableName: "tracking"
    },
    users: {
        idName: "users",
        tableName: "users"
    },
    dynamoConfig: {
        endpoint: "http://dynamodb.us-east-2.amazonaws.com"
    }

}

module.exports = dynamoTablesDevR