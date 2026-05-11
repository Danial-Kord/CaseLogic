$ErrorActionPreference = "Stop"

function Get-Rgb([int]$r, [int]$g, [int]$b) {
    return $r + (256 * $g) + (65536 * $b)
}

function Set-Fill($shape, [int]$r, [int]$g, [int]$b, [double]$transparency = 0.0) {
    $shape.Fill.Visible = -1
    $shape.Fill.Solid()
    $shape.Fill.ForeColor.RGB = Get-Rgb $r $g $b
    $shape.Fill.Transparency = $transparency
}

function Set-Line($shape, [int]$r, [int]$g, [int]$b, [double]$weight = 1.0, [double]$transparency = 0.0) {
    $shape.Line.Visible = -1
    $shape.Line.ForeColor.RGB = Get-Rgb $r $g $b
    $shape.Line.Weight = $weight
    $shape.Line.Transparency = $transparency
}

function Hide-Line($shape) {
    $shape.Line.Visible = 0
}

function Add-TextBox {
    param(
        $slide,
        [double]$left,
        [double]$top,
        [double]$width,
        [double]$height,
        [string]$text,
        [string]$fontName = "Aptos",
        [double]$fontSize = 20,
        [int]$r = 255,
        [int]$g = 255,
        [int]$b = 255,
        [bool]$bold = $false,
        [bool]$italic = $false,
        [int]$paragraphAlign = 1,
        [double]$marginLeft = 8,
        [double]$marginRight = 8,
        [double]$marginTop = 4,
        [double]$marginBottom = 4
    )

    $shape = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
    Hide-Line $shape
    $shape.TextFrame.MarginLeft = $marginLeft
    $shape.TextFrame.MarginRight = $marginRight
    $shape.TextFrame.MarginTop = $marginTop
    $shape.TextFrame.MarginBottom = $marginBottom
    $shape.TextFrame.WordWrap = -1
    $shape.TextFrame.TextRange.Text = $text
    $shape.TextFrame.TextRange.Font.Name = $fontName
    $shape.TextFrame.TextRange.Font.Size = $fontSize
    $shape.TextFrame.TextRange.Font.Bold = $(if ($bold) { -1 } else { 0 })
    $shape.TextFrame.TextRange.Font.Italic = $(if ($italic) { -1 } else { 0 })
    $shape.TextFrame.TextRange.Font.Color.RGB = Get-Rgb $r $g $b
    $shape.TextFrame.TextRange.ParagraphFormat.Alignment = $paragraphAlign
    return $shape
}

function Add-Card {
    param(
        $slide,
        [double]$left,
        [double]$top,
        [double]$width,
        [double]$height,
        [int]$fillR,
        [int]$fillG,
        [int]$fillB,
        [int]$lineR = 51,
        [int]$lineG = 65,
        [int]$lineB = 85,
        [double]$lineWeight = 1.0
    )

    $shape = $slide.Shapes.AddShape(5, $left, $top, $width, $height)
    Set-Fill $shape $fillR $fillG $fillB
    Set-Line $shape $lineR $lineG $lineB $lineWeight
    return $shape
}

function Add-RuleLine {
    param($slide, [double]$x1, [double]$y1, [double]$x2, [double]$y2, [int]$r, [int]$g, [int]$b, [double]$weight = 1.25)
    $line = $slide.Shapes.AddLine($x1, $y1, $x2, $y2)
    Set-Line $line $r $g $b $weight
    return $line
}

function Add-Svg {
    param(
        $slide,
        [string]$path,
        [double]$left,
        [double]$top,
        [double]$width,
        [double]$height
    )

    return $slide.Shapes.AddPicture($path, 0, -1, $left, $top, $width, $height)
}

function Add-Anim($slide, $shape, [int]$trigger = 1) {
    try {
        $null = $slide.TimeLine.MainSequence.AddEffect($shape, 1, 0, $trigger)
    } catch {
        # Keep generation resilient if one effect fails to bind.
    }
}

function Add-AnimSet($slide, $shapes, [int]$firstTrigger = 1) {
    $validShapes = @()
    foreach ($shape in $shapes) {
        if ($null -ne $shape) {
            $validShapes += $shape
        }
    }
    if ($validShapes.Count -eq 0) {
        return
    }

    Add-Anim $slide $validShapes[0] $firstTrigger
    for ($i = 1; $i -lt $validShapes.Count; $i++) {
        Add-Anim $slide $validShapes[$i] 2
    }
}

function Add-Note {
    param($slide, [string]$text)
    try {
        $notesShape = $slide.NotesPage.Shapes.Placeholders.Item(2)
        $notesShape.TextFrame.TextRange.Text = $text
        $notesShape.TextFrame.TextRange.Font.Name = "Aptos"
        $notesShape.TextFrame.TextRange.Font.Size = 12
    } catch {
        # Notes are helpful but non-critical.
    }
}

function Add-DarkBackground($slide) {
    $bg = $slide.Shapes.AddShape(1, 0, 0, 960, 540)
    Set-Fill $bg 15 23 42
    Hide-Line $bg
    return $bg
}

function Add-SectionHeader($slide, [string]$eyebrow, [string]$title) {
    $eyebrowShape = Add-TextBox -slide $slide -left 52 -top 30 -width 180 -height 20 `
        -text $eyebrow -fontName "Aptos" -fontSize 10 -r 148 -g 163 -b 184 -bold $true
    $titleShape = Add-TextBox -slide $slide -left 52 -top 48 -width 520 -height 34 `
        -text $title -fontName "Aptos Display" -fontSize 22 -r 248 -g 250 -b 252 -bold $true
    $rule = Add-RuleLine -slide $slide -x1 52 -y1 92 -x2 908 -y2 92 -r 51 -g 65 -b 85
    return @($eyebrowShape, $titleShape, $rule)
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$assetsDir = Join-Path $scriptRoot "presentation_assets"
$outputPath = Join-Path $scriptRoot "CaseLogic_7min_Presentation.pptx"

$heroSvg = Join-Path $assetsDir "hero_orbit.svg"
$pipelineSvg = Join-Path $assetsDir "pipeline_flow.svg"
$verifierSvg = Join-Path $assetsDir "verifier_badge.svg"
$chatSvg = Join-Path $assetsDir "chat_surface.svg"
$proofSvg = Join-Path $assetsDir "proof_signal.svg"

$pp = $null
$presentation = $null

try {
    $pp = New-Object -ComObject PowerPoint.Application
    $pp.Visible = -1

    $presentation = $pp.Presentations.Add($true)

    try {
        $presentation.PageSetup.SlideWidth = 960
        $presentation.PageSetup.SlideHeight = 540
    } catch {
        # Some Office automation contexts don't expose these setters.
    }

    # ------------------------------------------------------------------ slide 1
    $slide = $presentation.Slides.Add(1, 12)
    Add-DarkBackground $slide | Out-Null

    $accent = $slide.Shapes.AddShape(1, 56, 68, 100, 8)
    Set-Fill $accent 45 212 191
    Hide-Line $accent

    $title = Add-TextBox -slide $slide -left 56 -top 112 -width 360 -height 60 `
        -text "CaseLogic" -fontName "Aptos Display" -fontSize 30 -r 248 -g 250 -b 252 -bold $true
    $subtitle = Add-TextBox -slide $slide -left 56 -top 178 -width 360 -height 44 `
        -text "Retrieval-first legal research." -fontName "Aptos Display" -fontSize 20 -r 203 -g 213 -b 225
    $kicker = Add-TextBox -slide $slide -left 56 -top 238 -width 400 -height 52 `
        -text "Newest repo highlight: deterministic citation and quote verification on chat answers." `
        -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184
    $foot = Add-TextBox -slide $slide -left 56 -top 434 -width 360 -height 22 `
        -text "Implemented features only. No roadmap inflation." -fontName "Aptos" -fontSize 11 -r 100 -g 116 -b 139
    $hero = Add-Svg -slide $slide -path $heroSvg -left 526 -top 78 -width 330 -height 330

    Add-AnimSet $slide @($title, $subtitle)
    Add-AnimSet $slide @($kicker)
    Add-AnimSet $slide @($hero, $accent, $foot)

    Add-Note $slide @"
0:00-0:40
Open very simply.
CaseLogic is a retrieval-first legal research prototype. The important update since the earlier deck is that the repo now has a real deterministic verification layer for citations and verbatim quotes in chat answers.
This presentation is intentionally grounded in implemented code paths, not planned features.
"@

    # ------------------------------------------------------------------ slide 2
    $slide = $presentation.Slides.Add(2, 12)
    Add-DarkBackground $slide | Out-Null
    $header = Add-SectionHeader $slide "PRODUCT LOOP" "One boring, trustworthy loop"
    Add-AnimSet $slide $header

    $pipeline = Add-Svg -slide $slide -path $pipelineSvg -left 96 -top 132 -width 768 -height 256

    $chip1 = Add-Card -slide $slide -left 92 -top 406 -width 170 -height 52 -fillR 17 -fillG 24 -fillB 39 -lineR 45 -lineG 212 -lineB 191 -lineWeight 1.4
    $chip1Text = Add-TextBox -slide $slide -left 106 -top 423 -width 142 -height 20 -text "ingest + cache" -fontName "Aptos Display" -fontSize 15 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2

    $chip2 = Add-Card -slide $slide -left 292 -top 406 -width 170 -height 52 -fillR 17 -fillG 24 -fillB 39 -lineR 96 -lineG 165 -lineB 250 -lineWeight 1.4
    $chip2Text = Add-TextBox -slide $slide -left 306 -top 423 -width 142 -height 20 -text "retrieve first" -fontName "Aptos Display" -fontSize 15 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2

    $chip3 = Add-Card -slide $slide -left 492 -top 406 -width 170 -height 52 -fillR 17 -fillG 24 -fillB 39 -lineR 245 -lineG 158 -lineB 11 -lineWeight 1.4
    $chip3Text = Add-TextBox -slide $slide -left 506 -top 423 -width 142 -height 20 -text "draft answer" -fontName "Aptos Display" -fontSize 15 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2

    $chip4 = Add-Card -slide $slide -left 692 -top 406 -width 170 -height 52 -fillR 17 -fillG 24 -fillB 39 -lineR 244 -lineG 114 -lineB 182 -lineWeight 1.4
    $chip4Text = Add-TextBox -slide $slide -left 706 -top 423 -width 142 -height 20 -text "verify + persist" -fontName "Aptos Display" -fontSize 15 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2

    Add-AnimSet $slide @($pipeline)
    Add-AnimSet $slide @($chip1, $chip1Text)
    Add-AnimSet $slide @($chip2, $chip2Text)
    Add-AnimSet $slide @($chip3, $chip3Text)
    Add-AnimSet $slide @($chip4, $chip4Text)

    Add-Note $slide @"
0:40-1:20
This is the entire product philosophy in one slide.
Ingest authoritative sources, retrieve before answering, let Claude draft on retrieved evidence, then verify and persist what happened.
The loop is intentionally conservative. It values traceability over flashy reasoning.
"@

    # ------------------------------------------------------------------ slide 3
    $slide = $presentation.Slides.Add(3, 12)
    Add-DarkBackground $slide | Out-Null
    $header = Add-SectionHeader $slide "NEWEST REPO FEATURES" "What changed beyond plain search"
    Add-AnimSet $slide $header

    $verifier = Add-Svg -slide $slide -path $verifierSvg -left 78 -top 124 -width 286 -height 286
    Add-AnimSet $slide @($verifier)

    $card1 = Add-Card -slide $slide -left 420 -top 124 -width 460 -height 62 -fillR 17 -fillG 24 -fillB 39 -lineR 45 -lineG 212 -lineB 191 -lineWeight 1.4
    $card1Title = Add-TextBox -slide $slide -left 442 -top 138 -width 210 -height 18 -text "citation + quote verifier" -fontName "Aptos Display" -fontSize 16 -r 248 -g 250 -b 252 -bold $true
    $card1Body = Add-TextBox -slide $slide -left 442 -top 156 -width 400 -height 16 -text "Deterministic audit in backend/verification." -fontName "Aptos" -fontSize 12 -r 148 -g 163 -b 184

    $card2 = Add-Card -slide $slide -left 420 -top 204 -width 460 -height 62 -fillR 17 -fillG 24 -fillB 39 -lineR 96 -lineG 165 -lineB 250 -lineWeight 1.4
    $card2Title = Add-TextBox -slide $slide -left 442 -top 218 -width 210 -height 18 -text "live SSE thinking trace" -fontName "Aptos Display" -fontSize 16 -r 248 -g 250 -b 252 -bold $true
    $card2Body = Add-TextBox -slide $slide -left 442 -top 236 -width 400 -height 16 -text "The chat surface now streams tool progress, not just final text." -fontName "Aptos" -fontSize 12 -r 148 -g 163 -b 184

    $card3 = Add-Card -slide $slide -left 420 -top 284 -width 460 -height 62 -fillR 17 -fillG 24 -fillB 39 -lineR 245 -lineG 158 -lineB 11 -lineWeight 1.4
    $card3Title = Add-TextBox -slide $slide -left 442 -top 298 -width 240 -height 18 -text "per-turn web-search toggle" -fontName "Aptos Display" -fontSize 16 -r 248 -g 250 -b 252 -bold $true
    $card3Body = Add-TextBox -slide $slide -left 442 -top 316 -width 400 -height 16 -text "Users can keep Claude inside the local corpus for a turn." -fontName "Aptos" -fontSize 12 -r 148 -g 163 -b 184

    $card4 = Add-Card -slide $slide -left 420 -top 364 -width 460 -height 62 -fillR 17 -fillG 24 -fillB 39 -lineR 244 -lineG 114 -lineB 182 -lineWeight 1.4
    $card4Title = Add-TextBox -slide $slide -left 442 -top 378 -width 240 -height 18 -text "verification persisted on messages" -fontName "Aptos Display" -fontSize 16 -r 248 -g 250 -b 252 -bold $true
    $card4Body = Add-TextBox -slide $slide -left 442 -top 396 -width 400 -height 16 -text "Assistant rows now store verification_json for reloads." -fontName "Aptos" -fontSize 12 -r 148 -g 163 -b 184

    Add-AnimSet $slide @($card1, $card1Title, $card1Body)
    Add-AnimSet $slide @($card2, $card2Title, $card2Body)
    Add-AnimSet $slide @($card3, $card3Title, $card3Body)
    Add-AnimSet $slide @($card4, $card4Title, $card4Body)

    Add-Note $slide @"
1:20-2:10
This slide is the real repo delta.
The standout new feature is the verification layer: backend/verification extracts citations and direct quotes, checks them against retrieved evidence, and returns a structured report.
Around that, the chat API also grew a streaming trace, a web-search toggle, and persisted verification metadata on assistant turns.
"@

    # ------------------------------------------------------------------ slide 4
    $slide = $presentation.Slides.Add(4, 12)
    Add-DarkBackground $slide | Out-Null
    $header = Add-SectionHeader $slide "CITATION VERIFIER" "Flags. Never rewrites."
    Add-AnimSet $slide $header

    $leftCard = Add-Card -slide $slide -left 74 -top 148 -width 372 -height 250 -fillR 17 -fillG 24 -fillB 39 -lineR 45 -lineG 212 -lineB 191 -lineWeight 1.6
    $leftTitle = Add-TextBox -slide $slide -left 98 -top 174 -width 130 -height 22 -text "clean example" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $leftChip = Add-Card -slide $slide -left 98 -top 214 -width 132 -height 34 -fillR 13 -fillG 148 -fillB 136 -lineR 13 -lineG 148 -lineB 136
    Hide-Line $leftChip
    $leftChipText = Add-TextBox -slide $slide -left 106 -top 221 -width 116 -height 18 -text "status: clean" -fontName "Aptos" -fontSize 12 -r 240 -g 253 -b 250 -bold $true -paragraphAlign 2
    $leftBody = Add-TextBox -slide $slide -left 98 -top 270 -width 300 -height 88 `
        -text "Supported citation extracted.`r`nSupported verbatim quote matched.`r`nNo hidden rewrite step." `
        -fontName "Aptos" -fontSize 16 -r 203 -g 213 -b 225

    $rightCard = Add-Card -slide $slide -left 514 -top 148 -width 372 -height 250 -fillR 17 -fillG 24 -fillB 39 -lineR 245 -lineG 158 -lineB 11 -lineWeight 1.6
    $rightTitle = Add-TextBox -slide $slide -left 538 -top 174 -width 180 -height 22 -text "needs review example" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $rightChip = Add-Card -slide $slide -left 538 -top 214 -width 166 -height 34 -fillR 146 -fillG 64 -fillB 14 -lineR 146 -lineG 64 -lineB 14
    Hide-Line $rightChip
    $rightChipText = Add-TextBox -slide $slide -left 546 -top 221 -width 150 -height 18 -text "status: unsupported" -fontName "Aptos" -fontSize 12 -r 255 -g 237 -b 213 -bold $true -paragraphAlign 2
    $rightBody = Add-TextBox -slide $slide -left 538 -top 270 -width 300 -height 88 `
        -text "Fabricated quote surfaced explicitly.`r`nUnsupported citation stays visible.`r`nLawyer gets the warning, not false confidence." `
        -fontName "Aptos" -fontSize 16 -r 203 -g 213 -b 225

    $proofLine = Add-TextBox -slide $slide -left 128 -top 438 -width 704 -height 24 `
        -text "Exercised locally with verify_turn: clean on matched evidence, unsupported on fabricated quote text." `
        -fontName "Aptos" -fontSize 13 -r 148 -g 163 -b 184 -paragraphAlign 2

    Add-AnimSet $slide @($leftCard, $leftTitle, $leftChip, $leftChipText, $leftBody)
    Add-AnimSet $slide @($rightCard, $rightTitle, $rightChip, $rightChipText, $rightBody)
    Add-AnimSet $slide @($proofLine)

    Add-Note $slide @"
2:10-3:00
This is the most important new capability to explain carefully.
The verifier is deterministic, not another generation pass. It extracts direct citations and direct quotes, checks them against retrieved evidence, and produces a structured clean or unsupported report.
Most importantly, it flags unsupported material instead of silently cleaning the answer.
"@

    # ------------------------------------------------------------------ slide 5
    $slide = $presentation.Slides.Add(5, 12)
    Add-DarkBackground $slide | Out-Null
    $header = Add-SectionHeader $slide "CURRENT UX" "Chat-first, with source inspection built in"
    Add-AnimSet $slide $header

    $chatSurface = Add-Svg -slide $slide -path $chatSvg -left 72 -top 112 -width 816 -height 358
    Add-AnimSet $slide @($chatSurface)

    $tag1 = Add-Card -slide $slide -left 84 -top 482 -width 176 -height 38 -fillR 17 -fillG 24 -fillB 39 -lineR 45 -lineG 212 -lineB 191 -lineWeight 1.2
    $tag1Text = Add-TextBox -slide $slide -left 94 -top 492 -width 156 -height 18 -text "persistent chats" -fontName "Aptos Display" -fontSize 14 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $tag2 = Add-Card -slide $slide -left 282 -top 482 -width 176 -height 38 -fillR 17 -fillG 24 -fillB 39 -lineR 96 -lineG 165 -lineB 250 -lineWeight 1.2
    $tag2Text = Add-TextBox -slide $slide -left 292 -top 492 -width 156 -height 18 -text "streamed thinking" -fontName "Aptos Display" -fontSize 14 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $tag3 = Add-Card -slide $slide -left 480 -top 482 -width 176 -height 38 -fillR 17 -fillG 24 -fillB 39 -lineR 245 -lineG 158 -lineB 11 -lineWeight 1.2
    $tag3Text = Add-TextBox -slide $slide -left 490 -top 492 -width 156 -height 18 -text "inline source cards" -fontName "Aptos Display" -fontSize 14 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $tag4 = Add-Card -slide $slide -left 678 -top 482 -width 176 -height 38 -fillR 17 -fillG 24 -fillB 39 -lineR 244 -lineG 114 -lineB 182 -lineWeight 1.2
    $tag4Text = Add-TextBox -slide $slide -left 688 -top 492 -width 156 -height 18 -text "source modal" -fontName "Aptos Display" -fontSize 14 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2

    Add-AnimSet $slide @($tag1, $tag1Text)
    Add-AnimSet $slide @($tag2, $tag2Text)
    Add-AnimSet $slide @($tag3, $tag3Text)
    Add-AnimSet $slide @($tag4, $tag4Text)

    Add-Note $slide @"
3:00-3:50
Describe the actual surface the user experiences now.
The app is no longer just a static three-panel search mockup. It uses persistent chats, can stream visible progress during a turn, shows inline statute hits in the conversation, and opens full source text in a modal.
One honest caveat: the backend already stores verification reports, but the main chat UI is still light on explicit verification badges.
"@

    # ------------------------------------------------------------------ slide 6
    $slide = $presentation.Slides.Add(6, 12)
    Add-DarkBackground $slide | Out-Null
    $header = Add-SectionHeader $slide "PROOF" "What this repo already demonstrates"
    Add-AnimSet $slide $header

    $proof = Add-Svg -slide $slide -path $proofSvg -left 80 -top 138 -width 280 -height 280
    Add-AnimSet $slide @($proof)

    $stat1 = Add-Card -slide $slide -left 422 -top 152 -width 198 -height 92 -fillR 17 -fillG 24 -fillB 39 -lineR 45 -lineG 212 -lineB 191 -lineWeight 1.5
    $stat1Big = Add-TextBox -slide $slide -left 438 -top 174 -width 166 -height 28 -text "15 / 15" -fontName "Aptos Display" -fontSize 26 -r 45 -g 212 -b 191 -bold $true -paragraphAlign 2
    $stat1Text = Add-TextBox -slide $slide -left 438 -top 206 -width 166 -height 22 -text "retrieval + API smoke tests" -fontName "Aptos" -fontSize 12 -r 203 -g 213 -b 225 -paragraphAlign 2

    $stat2 = Add-Card -slide $slide -left 646 -top 152 -width 198 -height 92 -fillR 17 -fillG 24 -fillB 39 -lineR 96 -lineG 165 -lineB 250 -lineWeight 1.5
    $stat2Big = Add-TextBox -slide $slide -left 662 -top 174 -width 166 -height 28 -text "5 / 5" -fontName "Aptos Display" -fontSize 26 -r 96 -g 165 -b 250 -bold $true -paragraphAlign 2
    $stat2Text = Add-TextBox -slide $slide -left 662 -top 206 -width 166 -height 22 -text "chat adapter smoke tests" -fontName "Aptos" -fontSize 12 -r 203 -g 213 -b 225 -paragraphAlign 2

    $statusA = Add-Card -slide $slide -left 422 -top 284 -width 422 -height 58 -fillR 17 -fillG 24 -fillB 39 -lineR 245 -lineG 158 -lineB 11 -lineWeight 1.3
    $statusAText = Add-TextBox -slide $slide -left 440 -top 302 -width 386 -height 20 -text "Verifier exercised locally: clean + unsupported outcomes observed." -fontName "Aptos Display" -fontSize 15 -r 248 -g 250 -b 252 -bold $true

    $statusB = Add-Card -slide $slide -left 422 -top 360 -width 422 -height 58 -fillR 17 -fillG 24 -fillB 39 -lineR 100 -lineG 116 -lineB 139 -lineWeight 1.0
    $statusBText = Add-TextBox -slide $slide -left 440 -top 378 -width 386 -height 20 -text "Current workspace is honest but empty: corpus needs fresh ingest before live demo." -fontName "Aptos" -fontSize 14 -r 203 -g 213 -b 225

    Add-AnimSet $slide @($stat1, $stat1Big, $stat1Text)
    Add-AnimSet $slide @($stat2, $stat2Big, $stat2Text)
    Add-AnimSet $slide @($statusA, $statusAText)
    Add-AnimSet $slide @($statusB, $statusBText)

    Add-Note $slide @"
3:50-4:40
This is the proof slide.
We already verified the search and chat surfaces with smoke tests, and we separately exercised the verifier to show both a supported and an unsupported outcome.
Be transparent that the current checkout still needs a fresh ingest to become a polished live demo corpus.
"@

    # ------------------------------------------------------------------ slide 7
    $slide = $presentation.Slides.Add(7, 12)
    Add-DarkBackground $slide | Out-Null
    $header = Add-SectionHeader $slide "HONEST GAPS" "What is still partial"
    Add-AnimSet $slide $header

    $gap1 = Add-Card -slide $slide -left 70 -top 166 -width 250 -height 230 -fillR 17 -fillG 24 -fillB 39 -lineR 51 -lineG 65 -lineB 85 -lineWeight 1.2
    $gap1Title = Add-TextBox -slide $slide -left 94 -top 200 -width 202 -height 42 -text "Agent manifests are still placeholders" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $gap1Body = Add-TextBox -slide $slide -left 94 -top 268 -width 202 -height 56 -text "The working agent logic lives in backend/agent today." -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184 -paragraphAlign 2

    $gap2 = Add-Card -slide $slide -left 354 -top 166 -width 250 -height 230 -fillR 17 -fillG 24 -fillB 39 -lineR 51 -lineG 65 -lineB 85 -lineWeight 1.2
    $gap2Title = Add-TextBox -slide $slide -left 378 -top 200 -width 202 -height 42 -text "No shipped eval_report writer yet" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $gap2Body = Add-TextBox -slide $slide -left 378 -top 268 -width 202 -height 56 -text "Status can read eval metadata, but the producer is still missing." -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184 -paragraphAlign 2

    $gap3 = Add-Card -slide $slide -left 638 -top 166 -width 250 -height 230 -fillR 17 -fillG 24 -fillB 39 -lineR 51 -lineG 65 -lineB 85 -lineWeight 1.2
    $gap3Title = Add-TextBox -slide $slide -left 662 -top 200 -width 202 -height 42 -text "Verification is stronger in backend than in UI" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $gap3Body = Add-TextBox -slide $slide -left 662 -top 268 -width 202 -height 56 -text "Reports persist on assistant rows, but the main chat badge story still needs polish." -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184 -paragraphAlign 2

    Add-AnimSet $slide @($gap1, $gap1Title, $gap1Body)
    Add-AnimSet $slide @($gap2, $gap2Title, $gap2Body)
    Add-AnimSet $slide @($gap3, $gap3Title, $gap3Body)

    Add-Note $slide @"
4:40-5:30
Call these out yourself so nobody has to discover them by surprise.
The repo is ahead on backend grounding features, but still behind on agent packaging, evaluation reporting, and fully surfacing verification in the main chat UI.
That honesty actually strengthens the presentation.
"@

    # ------------------------------------------------------------------ slide 8
    $slide = $presentation.Slides.Add(8, 12)
    Add-DarkBackground $slide | Out-Null
    $header = Add-SectionHeader $slide "NEXT MOVES" "Fastest path to a stronger demo"
    Add-AnimSet $slide $header

    $closeHero = Add-TextBox -slide $slide -left 110 -top 126 -width 740 -height 44 `
        -text "The core loop is real. The next work is integration and polish." `
        -fontName "Aptos Display" -fontSize 24 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    Add-AnimSet $slide @($closeHero)

    $step1 = Add-Card -slide $slide -left 88 -top 222 -width 242 -height 162 -fillR 17 -fillG 24 -fillB 39 -lineR 45 -lineG 212 -lineB 191 -lineWeight 1.5
    $step1Num = Add-TextBox -slide $slide -left 108 -top 244 -width 40 -height 24 -text "01" -fontName "Aptos Display" -fontSize 20 -r 45 -g 212 -b 191 -bold $true
    $step1Title = Add-TextBox -slide $slide -left 108 -top 278 -width 180 -height 24 -text "Populate corpus" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $step1Body = Add-TextBox -slide $slide -left 108 -top 314 -width 194 -height 40 -text "Run ingest + retrieval build so the live experience has data behind it." -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184

    $step2 = Add-Card -slide $slide -left 358 -top 222 -width 242 -height 162 -fillR 17 -fillG 24 -fillB 39 -lineR 96 -lineG 165 -lineB 250 -lineWeight 1.5
    $step2Num = Add-TextBox -slide $slide -left 378 -top 244 -width 40 -height 24 -text "02" -fontName "Aptos Display" -fontSize 20 -r 96 -g 165 -b 250 -bold $true
    $step2Title = Add-TextBox -slide $slide -left 378 -top 278 -width 180 -height 24 -text "Surface verifier" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $step2Body = Add-TextBox -slide $slide -left 378 -top 314 -width 194 -height 40 -text "Turn stored verification_json into a visible chat badge and detail view." -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184

    $step3 = Add-Card -slide $slide -left 628 -top 222 -width 242 -height 162 -fillR 17 -fillG 24 -fillB 39 -lineR 245 -lineG 158 -lineB 11 -lineWeight 1.5
    $step3Num = Add-TextBox -slide $slide -left 648 -top 244 -width 40 -height 24 -text "03" -fontName "Aptos Display" -fontSize 20 -r 245 -g 158 -b 11 -bold $true
    $step3Title = Add-TextBox -slide $slide -left 648 -top 278 -width 180 -height 24 -text "Package agent layer" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $step3Body = Add-TextBox -slide $slide -left 648 -top 314 -width 194 -height 40 -text "Point the manifest files at the already-working agent loop." -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184

    $closeLine = Add-TextBox -slide $slide -left 150 -top 432 -width 660 -height 24 `
        -text "Best closing line: the system now shows its work, and the verifier makes unsupported claims visible." `
        -fontName "Aptos" -fontSize 15 -r 203 -g 213 -b 225 -paragraphAlign 2

    Add-AnimSet $slide @($step1, $step1Num, $step1Title, $step1Body)
    Add-AnimSet $slide @($step2, $step2Num, $step2Title, $step2Body)
    Add-AnimSet $slide @($step3, $step3Num, $step3Title, $step3Body)
    Add-AnimSet $slide @($closeLine)

    Add-Note $slide @"
5:30-7:00
End with momentum.
The architecture no longer needs a conceptual defense. The next steps are concrete: populate the corpus, surface the verifier in the UI, and package the current agent loop cleanly for the demo.
If you want a final sentence, use: CaseLogic now shows its work, and the verifier makes unsupported claims visible.
"@

    $presentation.SaveAs($outputPath)
}
finally {
    try {
        if ($presentation -ne $null) {
            $presentation.Close()
        }
    } catch {}
    try {
        if ($pp -ne $null) {
            $pp.Quit()
        }
    } catch {}
}

Write-Output "Saved presentation to $outputPath"
