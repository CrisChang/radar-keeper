import AppKit
import AVFoundation
import CoreVideo

enum DemoVideoError: Error {
  case invalidArguments
  case missingImage(String)
  case cannotCreateWriter
  case cannotCreatePixelBuffer
  case cannotCreateComposition
  case exportFailed(String)
}

func imageBuffer(from path: String, width: Int, height: Int) throws -> CVPixelBuffer {
  guard
    let image = NSImage(contentsOfFile: path),
    let source = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else {
    throw DemoVideoError.missingImage(path)
  }

  let attributes: [CFString: Any] = [
    kCVPixelBufferCGImageCompatibilityKey: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey: true,
  ]
  var optionalBuffer: CVPixelBuffer?
  let status = CVPixelBufferCreate(
    kCFAllocatorDefault,
    width,
    height,
    kCVPixelFormatType_32BGRA,
    attributes as CFDictionary,
    &optionalBuffer
  )
  guard status == kCVReturnSuccess, let buffer = optionalBuffer else {
    throw DemoVideoError.cannotCreatePixelBuffer
  }

  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

  guard let context = CGContext(
    data: CVPixelBufferGetBaseAddress(buffer),
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue
      | CGImageAlphaInfo.premultipliedFirst.rawValue
  ) else {
    throw DemoVideoError.cannotCreatePixelBuffer
  }

  context.setFillColor(NSColor(calibratedRed: 0.96, green: 0.97, blue: 0.98, alpha: 1).cgColor)
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
  return buffer
}

func waitUntilReady(_ input: AVAssetWriterInput) {
  while !input.isReadyForMoreMediaData {
    Thread.sleep(forTimeInterval: 0.005)
  }
}

guard CommandLine.arguments.count >= 4 else {
  throw DemoVideoError.invalidArguments
}

let outputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let audioURL = URL(fileURLWithPath: CommandLine.arguments[2])
let imagePaths = Array(CommandLine.arguments.dropFirst(3))
let width = 1280
let height = 720
let framesPerSecond: Int32 = 30

let audioAsset = AVURLAsset(url: audioURL)
let narrationDuration = max(audioAsset.duration.seconds, 20)
let totalDuration = narrationDuration + 1.0
let secondsPerImage = totalDuration / Double(imagePaths.count)
let frameCount = Int(ceil(totalDuration * Double(framesPerSecond)))
let imageBuffers = try imagePaths.map {
  try imageBuffer(from: $0, width: width, height: height)
}

let temporaryURL = FileManager.default.temporaryDirectory
  .appendingPathComponent("radar-keeper-demo-silent.mp4")
try? FileManager.default.removeItem(at: temporaryURL)
try? FileManager.default.removeItem(at: outputURL)

let writer = try AVAssetWriter(outputURL: temporaryURL, fileType: .mp4)
let videoSettings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
]
let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
videoInput.expectsMediaDataInRealTime = false

let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: videoInput,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
  ]
)

guard writer.canAdd(videoInput) else {
  throw DemoVideoError.cannotCreateWriter
}
writer.add(videoInput)
guard writer.startWriting() else {
  throw DemoVideoError.exportFailed(writer.error?.localizedDescription ?? "writer did not start")
}
writer.startSession(atSourceTime: .zero)

for frame in 0..<frameCount {
  waitUntilReady(videoInput)
  let seconds = Double(frame) / Double(framesPerSecond)
  let imageIndex = min(imageBuffers.count - 1, Int(seconds / secondsPerImage))
  let time = CMTime(value: CMTimeValue(frame), timescale: framesPerSecond)
  guard adaptor.append(imageBuffers[imageIndex], withPresentationTime: time) else {
    throw DemoVideoError.exportFailed(writer.error?.localizedDescription ?? "frame append failed")
  }
}

videoInput.markAsFinished()
let writerFinished = DispatchSemaphore(value: 0)
writer.finishWriting { writerFinished.signal() }
writerFinished.wait()
guard writer.status == .completed else {
  throw DemoVideoError.exportFailed(writer.error?.localizedDescription ?? "silent video failed")
}

let composition = AVMutableComposition()
let videoAsset = AVURLAsset(url: temporaryURL)
guard
  let sourceVideo = videoAsset.tracks(withMediaType: .video).first,
  let compositionVideo = composition.addMutableTrack(
    withMediaType: .video,
    preferredTrackID: kCMPersistentTrackID_Invalid
  ),
  let sourceAudio = audioAsset.tracks(withMediaType: .audio).first,
  let compositionAudio = composition.addMutableTrack(
    withMediaType: .audio,
    preferredTrackID: kCMPersistentTrackID_Invalid
  )
else {
  throw DemoVideoError.cannotCreateComposition
}

let videoRange = CMTimeRange(start: .zero, duration: videoAsset.duration)
let audioRange = CMTimeRange(start: .zero, duration: audioAsset.duration)
try compositionVideo.insertTimeRange(videoRange, of: sourceVideo, at: .zero)
try compositionAudio.insertTimeRange(audioRange, of: sourceAudio, at: .zero)

guard let exporter = AVAssetExportSession(
  asset: composition,
  presetName: AVAssetExportPresetHighestQuality
) else {
  throw DemoVideoError.cannotCreateComposition
}
exporter.outputURL = outputURL
exporter.outputFileType = .mp4
exporter.shouldOptimizeForNetworkUse = true

let exportFinished = DispatchSemaphore(value: 0)
exporter.exportAsynchronously { exportFinished.signal() }
exportFinished.wait()
guard exporter.status == .completed else {
  throw DemoVideoError.exportFailed(exporter.error?.localizedDescription ?? "final export failed")
}

print("Created \(outputURL.path) (\(String(format: "%.1f", totalDuration)) seconds)")
