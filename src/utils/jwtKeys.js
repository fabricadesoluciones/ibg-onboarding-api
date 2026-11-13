const parseSecrets = () => {
  const fromList = (process.env.JWT_SECRETS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (fromList.length > 0) {
    return fromList;
  }

  if (process.env.JWT_SECRET) {
    return [process.env.JWT_SECRET.trim()];
  }

  return [];
};

const getKeyRing = () => {
  const secrets = parseSecrets();
  const activeKid = process.env.JWT_ACTIVE_KID || "0";
  return { secrets, activeKid };
};

const getActiveKey = () => {
  const { secrets, activeKid } = getKeyRing();
  const index = Number(activeKid);
  const secret = secrets[index] || secrets[0];
  return { kid: String(Number.isNaN(index) ? 0 : index), secret };
};

const getKeyByKid = (kid) => {
  const { secrets } = getKeyRing();
  const index = Number(kid);
  if (Number.isNaN(index)) return null;
  const secret = secrets[index];
  if (!secret) return null;
  return { kid: String(index), secret };
};

const getAllKeys = () => {
  const { secrets } = getKeyRing();
  return secrets.map((secret, index) => ({ kid: String(index), secret }));
};

module.exports = {
  getActiveKey,
  getKeyByKid,
  getAllKeys,
};
