import AppKit
import Foundation

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width:size,height:size))
image.lockFocus()
let bg = NSBezierPath(roundedRect:NSRect(x:30,y:30,width:964,height:964),xRadius:170,yRadius:170)
NSColor(calibratedRed:0.065,green:0.067,blue:0.062,alpha:1).setFill()
bg.fill()
NSColor(calibratedRed:0.74,green:0.64,blue:0.36,alpha:1).setStroke()
bg.lineWidth=9
bg.stroke()
func dot(_ x:CGFloat,_ y:CGFloat,_ r:CGFloat,_ color:NSColor){
  color.setFill()
  NSBezierPath(ovalIn:NSRect(x:x-r,y:y-r,width:r*2,height:r*2)).fill()
}
let gold=NSColor(calibratedRed:0.88,green:0.78,blue:0.49,alpha:1)
let cream=NSColor(calibratedRed:0.98,green:0.97,blue:0.88,alpha:1)
let orange=NSColor(calibratedRed:1,green:0.39,blue:0.10,alpha:1)
let red=NSColor(calibratedRed:0.95,green:0.14,blue:0.10,alpha:1)
let off=NSColor(calibratedRed:0.22,green:0.22,blue:0.19,alpha:1)
for row in 0..<6 {
  for col in 0..<12 {
    let x=CGFloat(169+col*60),y=CGFloat(690-row*76)
    let lit=((col*7+row*5)%11<4)
    let color: NSColor = !lit ? off : row<2 ? red : row<4 ? orange : cream
    dot(x,y,19,color)
    if lit { dot(x,y,10,color.withAlphaComponent(0.8)) }
  }
}
for i in 0..<3 {
  let x:CGFloat=CGFloat(154+i*350)
  let y:CGFloat=178
  dot(x,y,54,gold)
  dot(x,y,43,NSColor(calibratedWhite:0.48,alpha:1))
  dot(x,y,32,NSColor(calibratedWhite:0.04,alpha:1))
}
let paragraph=NSMutableParagraphStyle();paragraph.alignment = .center
let title="STOPLERCHEATS"
title.draw(in:NSRect(x:65,y:810,width:894,height:100),withAttributes:[
 .font:NSFont.systemFont(ofSize:87,weight:.bold),
 .foregroundColor:gold,
 .paragraphStyle:paragraph
])
let sub="PATTERN GENERATOR  •  MIDI CONVERTER"
sub.draw(in:NSRect(x:65,y:95,width:894,height:45),withAttributes:[
 .font:NSFont.systemFont(ofSize:24,weight:.medium),
 .foregroundColor:cream,
 .paragraphStyle:paragraph
])
image.unlockFocus()
guard let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),
let png=bitmap.representation(using:.png,properties:[:]) else {fatalError("Could not render icon")}
try png.write(to:URL(fileURLWithPath:"electron/icon.png"))
