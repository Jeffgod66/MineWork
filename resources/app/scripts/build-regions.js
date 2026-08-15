"use strict";

const fs = require("node:fs");
const path = require("node:path");

const inputPath = process.argv[2];
const outputRoot = process.argv[3];
if (!inputPath || !outputRoot) {
  throw new Error("Usage: node build-regions.js <district.json> <assets-directory>");
}

const snapshot = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const roots = Array.isArray(snapshot?.data?.children) ? snapshot.data.children : [];
const provinces = [];
const cities = [];
const areas = [];

for (const province of roots) {
  const provinceCode = String(province.code || "").slice(0, 2);
  if (!provinceCode || ["81", "82"].includes(provinceCode)) continue;
  provinces.push({ code: provinceCode, name: province.name });

  const directAreas = [];
  for (const item of province.children || []) {
    if (Number(item.level) === 2) {
      const cityCode = String(item.code || "").slice(0, 4);
      cities.push({ code: cityCode, name: item.name, provinceCode });
      for (const district of item.children || []) {
        if (Number(district.level) !== 3) continue;
        areas.push({ code: String(district.code || "").slice(0, 6), name: district.name, cityCode, provinceCode });
      }
    } else if (Number(item.level) === 3) {
      directAreas.push(item);
    }
  }

  if (directAreas.length) {
    const isMunicipality = province.type === "直辖市";
    const cityCode = `${provinceCode}${isMunicipality ? "01" : "90"}`;
    cities.push({ code: cityCode, name: isMunicipality ? "市辖区" : "省直辖县级行政区划", provinceCode });
    directAreas.forEach((district) => areas.push({
      code: String(district.code || "").slice(0, 6),
      name: district.name,
      cityCode,
      provinceCode
    }));
  }
}

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, "provinces.json"), JSON.stringify(provinces), "utf8");
fs.writeFileSync(path.join(outputRoot, "cities.json"), JSON.stringify(cities), "utf8");
fs.writeFileSync(path.join(outputRoot, "areas.json"), JSON.stringify(areas), "utf8");
process.stdout.write(JSON.stringify({ provinces: provinces.length, cities: cities.length, areas: areas.length }));
