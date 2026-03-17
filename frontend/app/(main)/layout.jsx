export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard-wrapper">
      {/* You can add a dashboard sidebar or header here */}
      <main>{children}</main>
    </div>
  );
}