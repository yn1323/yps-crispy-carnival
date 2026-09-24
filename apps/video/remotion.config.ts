// Remotion CLIだけに適用される。Node.js APIで描画する場合は各APIへ直接渡す。
// https://www.remotion.dev/docs/config
import { Config } from "@remotion/cli/config";

// 本体のVite(3000)とanalytics-dashboard(3001)と重ならないポートで起動する
Config.setStudioPort(3002);
Config.setRspack(true);
// イラストとUIは平らな色面が多く、JPEGのノイズで動画が重くなるためPNGで書き出す
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
