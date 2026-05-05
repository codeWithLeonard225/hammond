// app/layout.jsx
import "../globals.css";
import { AuthProvider } from "../context/AuthContext";



export default function RootLayout({ children }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
   
  );
}
