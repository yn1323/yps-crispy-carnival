import schema from "../schema";

export const modules = import.meta.glob("../**/*.*s");
export { schema };
