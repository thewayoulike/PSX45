// Write a vitest that loads OGDC and asserts app pivots match TV golden
import { writeFileSync } from "fs";
const res = await fetch("http://localhost:3000/api/proxy?ohlc=OGDC");
const { bars } = await res.json();
writeFileSync("D:/PSX45/tmp_ogdc_bars.json", JSON.stringify(bars.slice(-80)));
console.log("wrote", bars.slice(-80).length, "bars, last", bars.at(-1));
