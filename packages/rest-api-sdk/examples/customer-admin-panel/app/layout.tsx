import "./globals.css";

export const metadata = {
  title: "Customer Admin Panel",
  description: "Customer admin panel example app powered by the Reflag REST API SDK",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ padding: "32px 16px" }}>{children}</body>
    </html>
  );
}
