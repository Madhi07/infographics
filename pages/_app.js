import "@/styles/globals.css";
import "@/utils/fontPage.js";
import { createInfographicsStore } from "@/stores/InfographicsStore";
import { createContext } from "react";
import { Observer } from "mobx-react-lite";
import infographicData from "@/constants/infographicData";

export const InfographicsContext = createContext(null);
const store = createInfographicsStore(infographicData);

export default function App({ Component, pageProps }) {
  return (
    <InfographicsContext.Provider value={store}>
      <Observer>{() => <Component {...pageProps} />}</Observer>
    </InfographicsContext.Provider>
  );
}
