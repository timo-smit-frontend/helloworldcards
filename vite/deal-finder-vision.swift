// Reads the text off listing photos with the recogniser macOS ships (the one behind Live
// Text), for the deal finder's PSA label reader. Free, local, and far better at a slab
// photographed through glare than Tesseract ever was.
//
// The dev server compiles this once and keeps it running. It takes one request per line
// on stdin — `<id>\t<image path>` — and answers each with one line of JSON on stdout,
// `{"id":…,"lines":[{"text":…,"confidence":0-100,"bbox":{"x0","y0","x1","y1"}}]}`, in
// whatever order the photos finish. Coordinates are pixels from the top left, which is
// how the label parser measures its rows.

import Foundation
import ImageIO
import Vision

struct Box: Encodable {
  let x0: Double
  let y0: Double
  let x1: Double
  let y1: Double
}

struct Line: Encodable {
  let text: String
  let confidence: Double
  let bbox: Box
}

struct Answer: Encodable {
  let id: String
  let lines: [Line]
}

/// A phone photo is far bigger than the label needs; past this the reader only gets slower.
let maxPixels = 3000

/// Row 1 of a PSA label, `2023 POKEMON MEW EN`, the one line every slab is found by.
let labelYear = try! NSRegularExpression(pattern: "\\b(?:19|20)\\d{2}\\b")
let labelBrand = try! NSRegularExpression(pattern: "P[O0Q]K[EÉ]?[MN][O0Q]N", options: [.caseInsensitive])

/// The photo the right way up, as its EXIF says it was taken.
func loadUpright(_ path: String) -> CGImage? {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else {
    return nil
  }
  let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: maxPixels,
  ]
  return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
}

func recognize(_ image: CGImage, _ orientation: CGImagePropertyOrientation) -> [Line] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  // Card names are not dictionary words; "correcting" them only invents new ones.
  request.usesLanguageCorrection = false
  request.recognitionLanguages = ["en-US"]

  let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return []
  }

  let sideways = orientation == .left || orientation == .right
  let width = Double(sideways ? image.height : image.width)
  let height = Double(sideways ? image.width : image.height)

  return (request.results ?? []).compactMap { observation in
    guard let best = observation.topCandidates(1).first else {
      return nil
    }
    let box = observation.boundingBox
    return Line(
      text: best.string,
      confidence: Double(best.confidence) * 100,
      bbox: Box(x0: box.minX * width, y0: (1 - box.maxY) * height, x1: box.maxX * width, y1: (1 - box.minY) * height)
    )
  }
}

func hasLabelRow(_ lines: [Line]) -> Bool {
  lines.contains { line in
    let range = NSRange(line.text.startIndex..., in: line.text)
    return labelYear.firstMatch(in: line.text, range: range) != nil && labelBrand.firstMatch(in: line.text, range: range) != nil
  }
}

/// Sellers photograph slabs on their side as often as upright, and the recogniser only
/// reads text the right way up — so a photo with no label row in it is tried turned
/// both ways before it is given up on.
func read(_ path: String) -> [Line] {
  guard let image = loadUpright(path) else {
    return []
  }
  let upright = recognize(image, .up)
  if hasLabelRow(upright) {
    return upright
  }
  for orientation in [CGImagePropertyOrientation.right, .left] {
    let turned = recognize(image, orientation)
    if hasLabelRow(turned) {
      return turned
    }
  }
  return upright
}

let workers = 4
let slots = DispatchSemaphore(value: workers)
let work = DispatchQueue(label: "vision-ocr.work", attributes: .concurrent)
let output = DispatchQueue(label: "vision-ocr.output")
let encoder = JSONEncoder()

while let request = readLine() {
  let parts = request.split(separator: "\t", maxSplits: 1).map(String.init)
  guard parts.count == 2 else {
    continue
  }
  slots.wait()
  work.async {
    autoreleasepool {
      let answer = Answer(id: parts[0], lines: read(parts[1]))
      output.sync {
        if var data = try? encoder.encode(answer) {
          data.append(0x0A)
          FileHandle.standardOutput.write(data)
        }
      }
    }
    slots.signal()
  }
}

// stdin closed: let the photos already being read finish before exiting.
for _ in 0..<workers {
  slots.wait()
}
