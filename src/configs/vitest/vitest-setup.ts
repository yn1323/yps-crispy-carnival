import { z } from "zod";
import { customErrorMap } from "../zod/zop-setup";

z.config({ customError: customErrorMap });
