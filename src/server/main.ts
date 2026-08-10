import { startServer } from './index';

const port = Number(process.env.PORT ?? 3001);

startServer(port).then(({ port: boundPort, dashboardPassword }) => {
  console.log(`bigdeal server listening on :${boundPort}`);
  console.log(`🔐 Dashboard: http://localhost:${boundPort}/dashboard  (password: ${dashboardPassword})`);
  if (!process.env.DASHBOARD_PASSWORD) {
    console.log('   Saved to .dashboard-password.local — stays the same across restarts. Set DASHBOARD_PASSWORD to override it.');
  }
});
