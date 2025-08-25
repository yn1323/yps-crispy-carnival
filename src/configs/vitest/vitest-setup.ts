import { z } from "zod";
import { customErrorMap } from "../zod/zop-setup";

z.setErrorMap(customErrorMap);
