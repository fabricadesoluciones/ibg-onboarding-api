const bcryptjs = require("bcryptjs");

const encrypt = async (passwordPlain) => {
    const hash = await bcryptjs.hash(passwordPlain, 12);
    return hash
}

const compare =  (passwordPlain, hashPasaword) => {
    return bcryptjs.compare(passwordPlain, hashPasaword);
}

module.exports = { encrypt , compare};