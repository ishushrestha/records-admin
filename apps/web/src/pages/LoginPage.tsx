import { LoginView } from "@/components/LoginView";
import { useLogin } from "@/hooks/useLogin";

export function LoginPage() {
  const props = useLogin();
  return <LoginView {...props} />;
}
