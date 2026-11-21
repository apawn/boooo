import Foundation
import Vision
import AppKit
let input=CommandLine.arguments[1], output=CommandLine.arguments[2]
let start=Int(CommandLine.arguments[3])!, end=Int(CommandLine.arguments[4])!
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories:true)
for i in start...end {
  let dest=String(format:"%@/%03d.json", output,i)
  if FileManager.default.fileExists(atPath:dest) { continue }
  autoreleasepool {
    do {
      let url=URL(fileURLWithPath:String(format:"%@/%03d.png",input,i))
      let req=VNRecognizeTextRequest()
      req.recognitionLevel = .accurate
      req.recognitionLanguages=["zh-Hans","en-US"]
      req.usesLanguageCorrection=true
      try VNImageRequestHandler(url:url).perform([req])
      let rows=(req.results ?? []).map { obs -> [String:Any] in
        let cs=obs.topCandidates(2), b=obs.boundingBox
        return ["text":cs.first?.string ?? "", "confidence":cs.first?.confidence ?? 0, "alternatives":cs.map{$0.string}, "x":b.minX,"y":b.minY,"w":b.width,"h":b.height]
      }
      let data=try JSONSerialization.data(withJSONObject:rows,options:[.prettyPrinted,.sortedKeys,.withoutEscapingSlashes])
      try data.write(to:URL(fileURLWithPath:dest))
      print("OCR \(i): \(rows.count) lines")
      fflush(stdout)
    } catch { print("ERROR \(i): \(error)"); fflush(stdout) }
  }
}
