import { useOutletContext } from "react-router-dom";
import AddressManager from "../../components/AddressManager";
import { extractUserId } from "../../utils/roles";

export default function ProfileMoradas() {
  const { user } = useOutletContext();
  return <AddressManager userId={extractUserId(user)} />;
}
