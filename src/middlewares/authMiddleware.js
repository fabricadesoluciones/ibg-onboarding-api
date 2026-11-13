const { verifyToken } = require("../utils/handleJwt");
const { succes, error } = require("../utils/handleResponse");
const { user_sessions: UserSession, users: User } = require("../models");

const authMiddleware = async (req, res, next) => {
  try {
    if (!req.headers.authorization) {
      error(res, "token error", 401);
      return;
    }

    const token = req.headers.authorization.split(" ").pop();
    const dataToken = await verifyToken(token);
    if (!dataToken || !dataToken.email) {
      error(res, "Unauthorized", 401);
      return;
    }

    let session = await UserSession.findOne({
      where: { session_jwt_token: token, is_active: 1 },
    });

    if (!session && dataToken?.id) {
      session = await UserSession.findOne({
        where: {
          user_id: dataToken.id,
          is_active: 1,
        },
        order: [["updated_at", "DESC"]],
      });
    }

    if (!session) {
      error(res, "Unauthorized", 401);
      return;
    }
    if (
      session.expires_at &&
      new Date(session.expires_at).getTime() < Date.now()
    ) {
      await session.update({ is_active: 0 });
      error(res, "Unauthorized", 401);
      return;
    }

    req.user = {
      id: dataToken.id,
      email: dataToken.email,
      role_id: dataToken.role_id,
      portal_type: dataToken.portal_type,
    };
    req.token = token;

    const user = await User.findOne({
      where: { id: dataToken.id, is_active: 1 },
    });

    if (!user) {
      error(res, "Unauthorized", 401);
      return;
    }

    if (user.temporary_password && dataToken.portal_type === "proveedor") {
      return res.status(403).json({
        code: -1,
        message: "FIRST_ACCESS_REQUIRED",
        first_access_required: true,
      });
    }

    next();
  } catch (err) {
    error(res, "Unauthorized", 401);
  }
};

const firstAccessAuthMiddleware = async (req, res, next) => {
  try {
    if (!req.headers.authorization) {
      error(res, "token error", 401);
      return;
    }

    const token = req.headers.authorization.split(" ").pop();
    const dataToken = await verifyToken(token);
    if (!dataToken || !dataToken.email || !dataToken.first_access) {
      error(res, "Unauthorized", 401);
      return;
    }

    const user = await User.findOne({
      where: { id: dataToken.id, email: dataToken.email, is_active: 1 },
    });

    if (!user || !user.temporary_password) {
      return res.status(403).json({
        code: -1,
        message: "FIRST_ACCESS_NOT_AVAILABLE",
      });
    }

    req.user = {
      id: dataToken.id,
      email: dataToken.email,
      role_id: dataToken.role_id,
      first_access: true,
      portal_type: dataToken.portal_type,
    };
    req.token = token;

    next();
  } catch (err) {
    error(res, "Unauthorized", 401);
  }
};

const PublicAuthMiddleware = async (req, res, next) => {
  try {
    const expectedString =
      process.env.PUBLIC_API_KEY ||
      "2DXrS3qdfviWURejnXxGWFtWujwbTHaUXD2ZGNTB44dY2mRB4RUMtkT3nRi0gXPn0qhiBp544Sevkp8YTT0gaeMQ4wTS3X0pqjae"; // Reemplaza esto con tu string secreto

    if (!req.headers.authorization) {
      error(res, "Unauthorized", 401);
      return;
    }

    const providedString = req.headers.authorization;

    if (providedString !== expectedString) {
      error(res, "Unauthorized", 401);
      return;
    }

    next();
  } catch (err) {
    error(res, "Unauthorized", 401);
  }
};

module.exports = { authMiddleware, firstAccessAuthMiddleware, PublicAuthMiddleware };
