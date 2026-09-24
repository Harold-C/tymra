import { MarketSignalType } from "@prisma/client";

import { AdapterError } from "@tymra/providers";

export function mapSignalType(type: string): MarketSignalType {
  if (Object.values(MarketSignalType).includes(type as MarketSignalType)) return type as MarketSignalType;
  throw new AdapterError("PARSING_ERROR", `Unsupported public signal type: ${type}`, false);
}
