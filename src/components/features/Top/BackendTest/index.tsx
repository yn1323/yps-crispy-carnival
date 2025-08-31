import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export const BackendTest = async () => {
  const users = await fetchQuery(api.functions.getUsers);

  return (
    <div>
      <h2>user List from Backend</h2>
      <ul>
        {users.map((user) => (
          <li key={user._id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
};
