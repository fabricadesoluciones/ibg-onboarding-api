const jwt = require("jsonwebtoken");
const { getActiveKey, getKeyByKid, getAllKeys } = require("./jwtKeys");

const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

const tokenSign = async (payload, options = {}) => {
    const { kid, secret } = getActiveKey();
    if (!secret) {
        throw new Error("JWT secret not configured");
    }
    const sign = await jwt.sign(
        payload,
        secret,
        {
            algorithm: "HS256",
            keyid: kid,
            expiresIn: options.expiresIn || DEFAULT_EXPIRES_IN,
        }
    );
    return sign;

}

const verifyToken = async (tokenJWT) => {
    try {
        const decoded = jwt.decode(tokenJWT, { complete: true });
        const kid = decoded && decoded.header ? decoded.header.kid : null;

        if (kid !== null && kid !== undefined) {
            const key = getKeyByKid(kid);
            if (!key) return null;
            return jwt.verify(tokenJWT, key.secret, { algorithms: ["HS256"] });
        }

        const keys = getAllKeys();
        for (const key of keys) {
            try {
                return jwt.verify(tokenJWT, key.secret, { algorithms: ["HS256"] });
            } catch (err) {
                // try next key
            }
        }
        return null;
    } catch(err) {
        return null;
    }
}

module.exports = { tokenSign, verifyToken };
