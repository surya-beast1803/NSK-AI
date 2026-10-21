import { createConvaiHandler } from '../../server/convaiHandler.js';

const handler = createConvaiHandler(process.env);

export default async function (req, res) {
  return handler(req, res);
}
