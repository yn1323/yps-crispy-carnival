import { createFileRoute } from "@tanstack/react-router";
import { DashboardContent } from "@/src/components/features/Dashboard/DashboardContent";
import { mockRecruitments, mockStaffs } from "@/src/components/features/Dashboard/mocks";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return <DashboardContent recruitments={mockRecruitments} staffs={mockStaffs} />;
}
