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
        [double]$lineWeight = 1.0
    )

    $shape = $slide.Shapes.AddShape(5, $left, $top, $width, $height)
    Set-Fill $shape $fillR $fillG $fillB
    Set-Line $shape 71 85 105 $lineWeight
    return $shape
}

function Add-RuleLine {
    param($slide, [double]$x1, [double]$y1, [double]$x2, [double]$y2, [int]$r, [int]$g, [int]$b, [double]$weight = 1.25)
    $line = $slide.Shapes.AddLine($x1, $y1, $x2, $y2)
    Set-Line $line $r $g $b $weight
    return $line
}

function Add-TitleFrame {
    param($slide, [string]$title, [string]$eyebrow = "")

    $null = $slide.Shapes.AddShape(1, 0, 0, 960, 540)
    Set-Fill $slide.Shapes.Item($slide.Shapes.Count) 15 23 42
    Hide-Line $slide.Shapes.Item($slide.Shapes.Count)

    $accent = $slide.Shapes.AddShape(1, 44, 34, 112, 8)
    Set-Fill $accent 45 212 191
    Hide-Line $accent

    if ($eyebrow) {
        $eyebrowShape = Add-TextBox -slide $slide -left 44 -top 46 -width 260 -height 24 `
            -text $eyebrow -fontName "Aptos" -fontSize 11 -r 148 -g 163 -b 184
        $eyebrowShape.TextFrame.TextRange.Font.Bold = -1
    }

    $titleShape = Add-TextBox -slide $slide -left 44 -top 70 -width 760 -height 60 `
        -text $title -fontName "Aptos Display" -fontSize 28 -r 248 -g 250 -b 252 -bold $true

    $rule = Add-RuleLine -slide $slide -x1 44 -y1 132 -x2 916 -y2 132 -r 51 -g 65 -b 85
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

function Add-Anim($slide, $shape, [int]$trigger = 1) {
    try {
        $null = $slide.TimeLine.MainSequence.AddEffect($shape, 1, 0, $trigger)
    } catch {
        # Keep generation resilient even if one animation binding fails.
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

$outputPath = Join-Path $PSScriptRoot "CaseLogic_7min_Presentation.pptx"
$pp = $null

try {
    $pp = New-Object -ComObject PowerPoint.Application
    $pp.Visible = -1

    $null = $pp.Presentations.Add($true)
    $presentation = $pp.ActivePresentation
    try {
        $presentation.PageSetup.SlideWidth = 960
        $presentation.PageSetup.SlideHeight = 540
    } catch {
        # Some Office automation contexts expose a reduced PageSetup surface.
        # The deck still generates correctly using the default widescreen size.
    }

    # ------------------------------------------------------------------ slide 1
    $slide = $presentation.Slides.Add(1, 12)
    Add-TitleFrame -slide $slide -title "CaseLogic" -eyebrow "7-MINUTE IMPLEMENTATION REVIEW"

    $hero = Add-TextBox -slide $slide -left 44 -top 160 -width 520 -height 110 `
        -text "Source-grounded vehicle-law research, built around retrieval before reasoning." `
        -fontName "Aptos Display" -fontSize 24 -r 226 -g 232 -b 240 -bold $true
    Add-Anim $slide $hero

    $sub = Add-TextBox -slide $slide -left 44 -top 270 -width 520 -height 78 `
        -text "This deck is based on the implemented code paths, passing smoke tests, and the repo walkthrough -- not on unfinished roadmap claims." `
        -fontName "Aptos" -fontSize 15 -r 148 -g 163 -b 184
    Add-Anim $slide $sub

    $chip1 = Add-Card -slide $slide -left 44 -top 380 -width 170 -height 42 -fillR 30 -fillG 41 -fillB 59
    $chip1Text = Add-TextBox -slide $slide -left 52 -top 389 -width 154 -height 24 -text "Hybrid retrieval" -fontName "Aptos" -fontSize 14 -r 248 -g 250 -b 252 -bold $true
    Add-AnimSet $slide @($chip1, $chip1Text)

    $chip2 = Add-Card -slide $slide -left 226 -top 380 -width 170 -height 42 -fillR 30 -fillG 41 -fillB 59
    $chip2Text = Add-TextBox -slide $slide -left 234 -top 389 -width 154 -height 24 -text "Grounded chat agent" -fontName "Aptos" -fontSize 14 -r 248 -g 250 -b 252 -bold $true
    Add-AnimSet $slide @($chip2, $chip2Text)

    $chip3 = Add-Card -slide $slide -left 408 -top 380 -width 170 -height 42 -fillR 30 -fillG 41 -fillB 59
    $chip3Text = Add-TextBox -slide $slide -left 416 -top 389 -width 154 -height 24 -text "Inspectable sources" -fontName "Aptos" -fontSize 14 -r 248 -g 250 -b 252 -bold $true
    Add-AnimSet $slide @($chip3, $chip3Text)

    $panel = Add-Card -slide $slide -left 620 -top 154 -width 290 -height 280 -fillR 18 -fillG 30 -fillB 54
    $panel.Line.ForeColor.RGB = Get-Rgb 45 212 191
    $panel.Line.Weight = 1.5
    $panelTitle = Add-TextBox -slide $slide -left 644 -top 178 -width 240 -height 32 `
        -text "Implemented anchors" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $panelBody = Add-TextBox -slide $slide -left 644 -top 220 -width 240 -height 188 `
        -text "backend/main.py mounts status, ingest, statutes, chat, and chats.`r`n`r`nHybrid retrieval combines citation parsing, FTS5, Chroma, and RRF.`r`n`r`nThe frontend now uses a persistent chat workflow with inline statute cards and a source modal." `
        -fontName "Aptos" -fontSize 14 -r 203 -g 213 -b 225
    Add-AnimSet $slide @($panel, $panelTitle, $panelBody)

    Add-Note $slide @"
0:00-0:40
Open by framing this as an implementation review, not a speculative roadmap.
The story: CaseLogic is trying to make vehicle-law research trustworthy by forcing retrieval before answer generation.
Call out the three themes on screen: hybrid retrieval, grounded chat, inspectable sources.
"@

    # ------------------------------------------------------------------ slide 2
    $slide = $presentation.Slides.Add(2, 12)
    Add-TitleFrame -slide $slide -title "Why This Prototype Exists" -eyebrow "PROBLEM"

    $left = Add-Card -slide $slide -left 44 -top 166 -width 400 -height 280 -fillR 30 -fillG 41 -fillB 59
    $leftTitle = Add-TextBox -slide $slide -left 68 -top 190 -width 220 -height 28 -text "The research pain" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $leftBody = Add-TextBox -slide $slide -left 68 -top 228 -width 332 -height 180 `
        -text "- Statute lookup is split across official sites and search habits.`r`n`r`n- Generic chatbots sound confident even when they cannot show the source.`r`n`r`n- Attorneys need exact language, not just summaries, especially for fault and traffic-rule questions." `
        -fontName "Aptos" -fontSize 16 -r 226 -g 232 -b 240
    Add-AnimSet $slide @($left, $leftTitle, $leftBody)

    $right = Add-Card -slide $slide -left 476 -top 166 -width 434 -height 280 -fillR 18 -fillG 30 -fillB 54
    $rightTitle = Add-TextBox -slide $slide -left 500 -top 190 -width 290 -height 28 -text "The design response" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $rightBody = Add-TextBox -slide $slide -left 500 -top 228 -width 364 -height 180 `
        -text "- Retrieve first.`r`n`r`n- Attach citations to factual claims.`r`n`r`n- Let the user open the full statute from the conversation.`r`n`r`n- Prefer authoritative domains when the agent has to leave the local corpus." `
        -fontName "Aptos" -fontSize 16 -r 226 -g 232 -b 240
    Add-AnimSet $slide @($right, $rightTitle, $rightBody)

    $footerBand = $slide.Shapes.AddShape(1, 44, 462, 866, 36)
    Set-Fill $footerBand 13 148 136
    Hide-Line $footerBand
    $footerText = Add-TextBox -slide $slide -left 56 -top 468 -width 842 -height 22 `
        -text "Trust comes from visible source text, not from a polished answer alone." `
        -fontName "Aptos" -fontSize 15 -r 240 -g 253 -b 250 -bold $true -paragraphAlign 2
    Add-AnimSet $slide @($footerBand, $footerText)

    Add-Note $slide @"
0:40-1:20
Explain the actual wedge this product targets.
We are not trying to replace legal reasoning with a generic LLM.
We are trying to compress the time from question to verified statute text.
"@

    # ------------------------------------------------------------------ slide 3
    $slide = $presentation.Slides.Add(3, 12)
    Add-TitleFrame -slide $slide -title "What Is Implemented Today" -eyebrow "CAPABILITIES"

    $cards = @(
        @{ L = 44;  T = 164; W = 264; H = 132; Title = "Ingestion CLI"; Body = "CA, FL, NY, and WA ingestion entrypoints exist. CA has a real adapter, HTML parser, caching, and persistence path."; Accent = @(45,212,191) },
        @{ L = 326; T = 164; W = 264; H = 132; Title = "Storage layer"; Body = "SQLite models cover statutes, factor tags, generic web documents, chat sessions, and chat messages."; Accent = @(245,158,11) },
        @{ L = 608; T = 164; W = 302; H = 132; Title = "Hybrid retrieval"; Body = "Citation fast-path plus FTS5 keyword search, Chroma vector search, and reciprocal-rank fusion."; Accent = @(96,165,250) },
        @{ L = 44;  T = 316; W = 408; H = 132; Title = "Grounded chat agent"; Body = "Anthropic tool-use loop calls search_statutes, get_statute, and a domain-whitelisted web_search tool before answering."; Accent = @(244,114,182) },
        @{ L = 470; T = 316; W = 440; H = 132; Title = "Frontend experience"; Body = "The Next.js app now centers on persistent chats, inline result tables, and a statute modal for full source inspection."; Accent = @(251,146,60) }
    )

    foreach ($cardSpec in $cards) {
        $card = Add-Card -slide $slide -left $cardSpec.L -top $cardSpec.T -width $cardSpec.W -height $cardSpec.H -fillR 30 -fillG 41 -fillB 59
        $card.Line.ForeColor.RGB = Get-Rgb $cardSpec.Accent[0] $cardSpec.Accent[1] $cardSpec.Accent[2]
        $card.Line.Weight = 1.5
        $title = Add-TextBox -slide $slide -left ($cardSpec.L + 18) -top ($cardSpec.T + 18) -width ($cardSpec.W - 36) -height 26 `
            -text $cardSpec.Title -fontName "Aptos Display" -fontSize 17 -r 248 -g 250 -b 252 -bold $true

        $body = Add-TextBox -slide $slide -left ($cardSpec.L + 18) -top ($cardSpec.T + 50) -width ($cardSpec.W - 36) -height ($cardSpec.H - 58) `
            -text $cardSpec.Body -fontName "Aptos" -fontSize 14 -r 203 -g 213 -b 225
        Add-AnimSet $slide @($card, $title, $body)
    }

    $honesty = Add-TextBox -slide $slide -left 44 -top 468 -width 866 -height 26 `
        -text "Important honesty: OpenClaw manifest files are still placeholders. The real working agent currently lives under backend/agent." `
        -fontName "Aptos" -fontSize 13 -r 148 -g 163 -b 184
    Add-Anim $slide $honesty

    Add-Note $slide @"
1:20-2:10
Use this slide to prove this is more than a mock UI.
Name the five implemented layers quickly: ingestion, storage, retrieval, chat agent, frontend.
Then make one candid note: the OpenClaw files are not the source of truth yet.
"@

    # ------------------------------------------------------------------ slide 4
    $slide = $presentation.Slides.Add(4, 12)
    Add-TitleFrame -slide $slide -title "How The Implemented Loop Works" -eyebrow "SYSTEM FLOW"

    $steps = @(
        @{ X = 40;  Title = "1. Ingest"; Body = "Fetch official statute HTML and cache it on disk."; Accent = @(45,212,191) },
        @{ X = 228; Title = "2. Persist"; Body = "Parse sections and store statutes plus factor tags in SQLite."; Accent = @(245,158,11) },
        @{ X = 416; Title = "3. Index"; Body = "Build vector and keyword views over the statute corpus."; Accent = @(96,165,250) },
        @{ X = 604; Title = "4. Retrieve"; Body = "Agent searches locally before it writes any factual answer."; Accent = @(244,114,182) },
        @{ X = 792; Title = "5. Inspect"; Body = "Frontend shows cards inline and opens the full source modal."; Accent = @(251,146,60) }
    )

    foreach ($step in $steps) {
        $shape = Add-Card -slide $slide -left $step.X -top 214 -width 136 -height 140 -fillR 18 -fillG 30 -fillB 54
        $shape.Line.ForeColor.RGB = Get-Rgb $step.Accent[0] $step.Accent[1] $step.Accent[2]
        $shape.Line.Weight = 1.4
        $title = Add-TextBox -slide $slide -left ($step.X + 10) -top 230 -width 116 -height 34 `
            -text $step.Title -fontName "Aptos Display" -fontSize 15 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2

        $body = Add-TextBox -slide $slide -left ($step.X + 10) -top 274 -width 116 -height 60 `
            -text $step.Body -fontName "Aptos" -fontSize 12 -r 203 -g 213 -b 225 -paragraphAlign 2
        Add-AnimSet $slide @($shape, $title, $body)
    }

    for ($i = 0; $i -lt 4; $i++) {
        $x1 = $steps[$i].X + 136
        $x2 = $steps[$i + 1].X
        $line = Add-RuleLine -slide $slide -x1 ($x1 + 6) -y1 284 -x2 ($x2 - 6) -y2 284 -r 71 -g 85 -b 105 -weight 2
        $arrow = $slide.Shapes.AddShape(33, $x2 - 16, 277, 10, 14)
        Set-Fill $arrow 71 85 105
        Hide-Line $arrow
    }

    $callout = Add-Card -slide $slide -left 136 -top 390 -width 688 -height 74 -fillR 30 -fillG 41 -fillB 59
    $calloutText = Add-TextBox -slide $slide -left 154 -top 407 -width 652 -height 40 `
        -text "Fast path: citation-shaped queries can skip semantic retrieval entirely. parse_citation turns inputs like 23152(a) into a stable slug before lookup." `
        -fontName "Aptos" -fontSize 15 -r 226 -g 232 -b 240 -paragraphAlign 2
    Add-AnimSet $slide @($callout, $calloutText)

    Add-Note $slide @"
2:10-2:55
Walk left to right.
This is the core implementation story: ingest, persist, index, retrieve, inspect.
Pause on the fast path because it is one of the strongest trust features: citation lookup does not depend on vector quality.
"@

    # ------------------------------------------------------------------ slide 5
    $slide = $presentation.Slides.Add(5, 12)
    Add-TitleFrame -slide $slide -title "Verified Results From This Repo" -eyebrow "SMOKE TESTS + SAFETY RULES"

    $kpi1 = Add-Card -slide $slide -left 44 -top 166 -width 198 -height 132 -fillR 18 -fillG 30 -fillB 54
    $kpi1Big = Add-TextBox -slide $slide -left 60 -top 190 -width 164 -height 44 -text "15 / 15" -fontName "Aptos Display" -fontSize 28 -r 45 -g 212 -b 191 -bold $true -paragraphAlign 2
    $kpi1Lbl = Add-TextBox -slide $slide -left 60 -top 238 -width 164 -height 38 -text "retrieval + API smoke tests passed" -fontName "Aptos" -fontSize 14 -r 226 -g 232 -b 240 -paragraphAlign 2
    Add-AnimSet $slide @($kpi1, $kpi1Big, $kpi1Lbl)

    $kpi2 = Add-Card -slide $slide -left 258 -top 166 -width 198 -height 132 -fillR 18 -fillG 30 -fillB 54
    $kpi2Big = Add-TextBox -slide $slide -left 274 -top 190 -width 164 -height 44 -text "5 / 5" -fontName "Aptos Display" -fontSize 28 -r 245 -g 158 -b 11 -bold $true -paragraphAlign 2
    $kpi2Lbl = Add-TextBox -slide $slide -left 274 -top 238 -width 164 -height 38 -text "chat adapter smoke tests passed" -fontName "Aptos" -fontSize 14 -r 226 -g 232 -b 240 -paragraphAlign 2
    Add-AnimSet $slide @($kpi2, $kpi2Big, $kpi2Lbl)

    $kpi3 = Add-Card -slide $slide -left 472 -top 166 -width 198 -height 132 -fillR 18 -fillG 30 -fillB 54
    $kpi3Big = Add-TextBox -slide $slide -left 488 -top 190 -width 164 -height 44 -text "17" -fontName "Aptos Display" -fontSize 28 -r 96 -g 165 -b 250 -bold $true -paragraphAlign 2
    $kpi3Lbl = Add-TextBox -slide $slide -left 488 -top 238 -width 164 -height 38 -text "locked factor labels exposed to retrieval and UI" -fontName "Aptos" -fontSize 14 -r 226 -g 232 -b 240 -paragraphAlign 2
    Add-AnimSet $slide @($kpi3, $kpi3Big, $kpi3Lbl)

    $kpi4 = Add-Card -slide $slide -left 686 -top 166 -width 224 -height 132 -fillR 18 -fillG 30 -fillB 54
    $kpi4Big = Add-TextBox -slide $slide -left 702 -top 190 -width 190 -height 44 -text "retrieve first" -fontName "Aptos Display" -fontSize 24 -r 244 -g 114 -b 182 -bold $true -paragraphAlign 2
    $kpi4Lbl = Add-TextBox -slide $slide -left 702 -top 238 -width 190 -height 38 -text "hard rule in the agent system prompt" -fontName "Aptos" -fontSize 14 -r 226 -g 232 -b 240 -paragraphAlign 2
    Add-AnimSet $slide @($kpi4, $kpi4Big, $kpi4Lbl)

    $proof = Add-Card -slide $slide -left 44 -top 330 -width 866 -height 126 -fillR 30 -fillG 41 -fillB 59
    $proofText = Add-TextBox -slide $slide -left 66 -top 352 -width 822 -height 80 `
        -text "- Citation normalization and exact-slug lookup are implemented and tested.`r`n- Assistant turns can persist enriched statute cards for reloads.`r`n- Web fallback is restricted to whitelisted legal domains rather than generic search results." `
        -fontName "Aptos" -fontSize 16 -r 226 -g 232 -b 240
    Add-AnimSet $slide @($proof, $proofText)

    $honest = Add-TextBox -slide $slide -left 44 -top 470 -width 866 -height 24 `
        -text "Honest current state: the local DB in this workspace is empty right now, so the deck reflects verified code behavior and tests rather than a freshly populated live corpus." `
        -fontName "Aptos" -fontSize 12 -r 148 -g 163 -b 184
    Add-Anim $slide $honest

    Add-Note $slide @"
2:55-3:45
This is the credibility slide.
Say exactly what was verified: retrieval/API smoke tests, chat adapter smoke tests, factor taxonomy, and the retrieve-first rule.
Also be explicit that the current checkout needs re-ingest before a live data demo.
"@

    # ------------------------------------------------------------------ slide 6
    $slide = $presentation.Slides.Add(6, 12)
    Add-TitleFrame -slide $slide -title "What The Product Experience Looks Like" -eyebrow "CHAT-FIRST UI"

    $browser = Add-Card -slide $slide -left 54 -top 162 -width 852 -height 314 -fillR 248 -fillG 250 -fillB 252
    $browser.Line.ForeColor.RGB = Get-Rgb 203 213 225
    $chrome = $slide.Shapes.AddShape(1, 54, 162, 852, 34)
    Set-Fill $chrome 226 232 240
    Hide-Line $chrome
    $chromeTitle = Add-TextBox -slide $slide -left 84 -top 170 -width 220 -height 18 -text "CaseLogic" -fontName "Aptos Display" -fontSize 14 -r 15 -g 23 -b 42 -bold $true

    $sidebar = $slide.Shapes.AddShape(1, 54, 196, 176, 280)
    Set-Fill $sidebar 241 245 249
    Hide-Line $sidebar
    $sidebarTitle = Add-TextBox -slide $slide -left 70 -top 212 -width 124 -height 18 -text "+ New chat" -fontName "Aptos" -fontSize 13 -r 15 -g 23 -b 42 -bold $true
    $sidebarItems = Add-TextBox -slide $slide -left 70 -top 252 -width 132 -height 130 `
        -text "Rear-end at red light`r`n`r`nCal. Veh. Code 23152(a)`r`n`r`nImproper passing" `
        -fontName "Aptos" -fontSize 12 -r 71 -g 85 -b 105

    $thread = $slide.Shapes.AddShape(1, 230, 196, 676, 280)
    Set-Fill $thread 255 255 255
    Hide-Line $thread
    Add-AnimSet $slide @($browser, $chrome, $chromeTitle, $thread)

    $userBubble = Add-Card -slide $slide -left 588 -top 224 -width 278 -height 44 -fillR 45 -fillG 212 -fillB 191
    Hide-Line $userBubble
    $userText = Add-TextBox -slide $slide -left 600 -top 234 -width 252 -height 22 `
        -text "What is the rule for red lights in CA?" -fontName "Aptos" -fontSize 13 -r 15 -g 23 -b 42
    Add-AnimSet $slide @($sidebar, $sidebarTitle, $sidebarItems)
    Add-AnimSet $slide @($userBubble, $userText)

    $assistantText = Add-TextBox -slide $slide -left 258 -top 286 -width 598 -height 58 `
        -text "Drivers facing a steady circular red signal must stop and remain stopped until an indication to proceed appears [cite: ca-veh-21453-a]." `
        -fontName "Aptos" -fontSize 14 -r 15 -g 23 -b 42
    Add-Anim $slide $assistantText

    $resultCard = Add-Card -slide $slide -left 258 -top 354 -width 608 -height 94 -fillR 248 -fillG 250 -fillB 252
    $resultCard.Line.ForeColor.RGB = Get-Rgb 45 212 191
    $resultTitle = Add-TextBox -slide $slide -left 274 -top 366 -width 320 -height 20 `
        -text "Cal. Veh. Code Section 21453(a)" -fontName "Aptos Display" -fontSize 14 -r 15 -g 23 -b 42 -bold $true
    $resultMeta = Add-TextBox -slide $slide -left 614 -top 366 -width 220 -height 20 `
        -text "matched_via: citation" -fontName "Aptos" -fontSize 12 -r 13 -g 148 -b 136 -bold $true -paragraphAlign 3
    $resultBody = Add-TextBox -slide $slide -left 274 -top 392 -width 560 -height 40 `
        -text "Inline result cards let the user inspect the hit, then open the full source text in a dedicated modal." `
        -fontName "Aptos" -fontSize 13 -r 71 -g 85 -b 105
    Add-AnimSet $slide @($resultCard, $resultTitle, $resultMeta, $resultBody)

    $callout1 = Add-TextBox -slide $slide -left 58 -top 486 -width 250 -height 28 -text "1. persistent chats" -fontName "Aptos Display" -fontSize 15 -r 45 -g 212 -b 191 -bold $true
    $callout2 = Add-TextBox -slide $slide -left 340 -top 486 -width 220 -height 28 -text "2. grounded answer" -fontName "Aptos Display" -fontSize 15 -r 245 -g 158 -b 11 -bold $true
    $callout3 = Add-TextBox -slide $slide -left 616 -top 486 -width 258 -height 28 -text "3. inspect the source" -fontName "Aptos Display" -fontSize 15 -r 96 -g 165 -b 250 -bold $true
    Add-AnimSet $slide @($callout1)
    Add-AnimSet $slide @($callout2)
    Add-AnimSet $slide @($callout3)

    Add-Note $slide @"
3:45-4:40
Describe the frontend from the user's perspective.
The important move is that statute results are part of the conversation, not a separate hidden debug panel.
That makes the answer and the evidence visible in one place.
"@

    # ------------------------------------------------------------------ slide 7
    $slide = $presentation.Slides.Add(7, 12)
    Add-TitleFrame -slide $slide -title "Grounding And Safety Are Built Into The Agent" -eyebrow "TRUST MODEL"

    $cols = @(
        @{ L = 44;  Title = "Retrieve first"; Body = "The system prompt explicitly forbids answering factual legal questions from memory. The agent is supposed to search before it states a rule."; Accent = @(45,212,191) },
        @{ L = 338; Title = "Cite every claim"; Body = "The prompt requires each factual statement to end with a cite marker so the answer can be traced back to a statute or an allowed web source."; Accent = @(245,158,11) },
        @{ L = 632; Title = "Limit web fallback"; Body = "If the agent leaves the local corpus, it uses a Firecrawl-backed search that rejects non-whitelisted domains server-side."; Accent = @(96,165,250) }
    )

    foreach ($col in $cols) {
        $shape = Add-Card -slide $slide -left $col.L -top 188 -width 250 -height 228 -fillR 18 -fillG 30 -fillB 54
        $shape.Line.ForeColor.RGB = Get-Rgb $col.Accent[0] $col.Accent[1] $col.Accent[2]
        $shape.Line.Weight = 1.5
        $badge = $slide.Shapes.AddShape(9, ($col.L + 92), 204, 66, 66)
        Set-Fill $badge $col.Accent[0] $col.Accent[1] $col.Accent[2]
        Hide-Line $badge

        $title = Add-TextBox -slide $slide -left ($col.L + 18) -top 286 -width 214 -height 28 `
            -text $col.Title -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
        $body = Add-TextBox -slide $slide -left ($col.L + 18) -top 322 -width 214 -height 74 `
            -text $col.Body -fontName "Aptos" -fontSize 13 -r 203 -g 213 -b 225 -paragraphAlign 2
        Add-AnimSet $slide @($shape, $badge, $title, $body)
    }

    $strip = Add-Card -slide $slide -left 124 -top 438 -width 706 -height 58 -fillR 30 -fillG 41 -fillB 59
    $stripText = Add-TextBox -slide $slide -left 144 -top 454 -width 666 -height 26 `
        -text "If no source supports a claim, the prompt instructs the agent to mark it unsupported rather than silently inventing or deleting it." `
        -fontName "Aptos" -fontSize 15 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    Add-AnimSet $slide @($strip, $stripText)

    Add-Note $slide @"
4:40-5:25
This is the trust slide.
Emphasize that the guardrails are not just UI language; they are baked into the prompt and tool design.
The strongest line to land: unsupported claims should be exposed, not hidden.
"@

    # ------------------------------------------------------------------ slide 8
    $slide = $presentation.Slides.Add(8, 12)
    Add-TitleFrame -slide $slide -title "Gaps We Can State Clearly -- And The Fastest Next Moves" -eyebrow "HONEST STATUS"

    $gap = Add-Card -slide $slide -left 44 -top 172 -width 398 -height 282 -fillR 30 -fillG 41 -fillB 59
    $gapTitle = Add-TextBox -slide $slide -left 64 -top 194 -width 250 -height 28 -text "Still missing or partial" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    $gapBody = Add-TextBox -slide $slide -left 64 -top 232 -width 338 -height 170 `
        -text "- OpenClaw tools.json and agent_prompt.md are still stubs.`r`n`r`n- There is no finished evaluation harness that writes eval_report.json yet.`r`n`r`n- This workspace needs a fresh ingest before it can demo a live populated corpus." `
        -fontName "Aptos" -fontSize 15 -r 226 -g 232 -b 240
    Add-AnimSet $slide @($gap, $gapTitle, $gapBody)

    $next = Add-Card -slide $slide -left 468 -top 172 -width 442 -height 282 -fillR 18 -fillG 30 -fillB 54
    $nextTitle = Add-TextBox -slide $slide -left 490 -top 194 -width 270 -height 28 -text "Best next 3 moves" -fontName "Aptos Display" -fontSize 18 -r 248 -g 250 -b 252 -bold $true
    Add-AnimSet $slide @($next, $nextTitle)

    $move1 = Add-Card -slide $slide -left 490 -top 236 -width 396 -height 58 -fillR 15 -fillG 23 -fillB 42
    $move1.Line.ForeColor.RGB = Get-Rgb 45 212 191
    $move1Text = Add-TextBox -slide $slide -left 506 -top 252 -width 364 -height 24 -text "1. Run full ingest + retrieval build so the live corpus is demo-ready." -fontName "Aptos" -fontSize 14 -r 248 -g 250 -b 252
    Add-AnimSet $slide @($move1, $move1Text)

    $move2 = Add-Card -slide $slide -left 490 -top 306 -width 396 -height 58 -fillR 15 -fillG 23 -fillB 42
    $move2.Line.ForeColor.RGB = Get-Rgb 245 158 11
    $move2Text = Add-TextBox -slide $slide -left 506 -top 322 -width 364 -height 24 -text "2. Add the eval-report writer so /status can show a real recall number." -fontName "Aptos" -fontSize 14 -r 248 -g 250 -b 252
    Add-AnimSet $slide @($move2, $move2Text)

    $move3 = Add-Card -slide $slide -left 490 -top 376 -width 396 -height 58 -fillR 15 -fillG 23 -fillB 42
    $move3.Line.ForeColor.RGB = Get-Rgb 96 165 250
    $move3Text = Add-TextBox -slide $slide -left 506 -top 392 -width 364 -height 24 -text "3. Point OpenClaw manifests at the already-working backend agent tools." -fontName "Aptos" -fontSize 14 -r 248 -g 250 -b 252
    Add-AnimSet $slide @($move3, $move3Text)

    $closeLine = Add-TextBox -slide $slide -left 44 -top 474 -width 866 -height 24 `
        -text "The good news: most remaining work is integration, dataset population, and reporting -- not a rewrite of the core architecture." `
        -fontName "Aptos" -fontSize 14 -r 148 -g 163 -b 184 -paragraphAlign 2
    Add-Anim $slide $closeLine

    Add-Note $slide @"
5:25-6:15
This slide keeps the presentation honest and makes the next steps concrete.
Frame the gaps as integration work, not evidence that the architecture is fake.
That turns the conversation from "is anything here real?" to "what gets us to demo readiness fastest?"
"@

    # ------------------------------------------------------------------ slide 9
    $slide = $presentation.Slides.Add(9, 12)
    Add-TitleFrame -slide $slide -title "Closing Takeaway" -eyebrow "WHY THIS MATTERS"

    $final = Add-TextBox -slide $slide -left 112 -top 164 -width 736 -height 94 `
        -text "CaseLogic already has the core research loop that matters most: ingest authoritative law, retrieve before answering, and let the user inspect the source immediately." `
        -fontName "Aptos Display" -fontSize 24 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    Add-Anim $slide $final

    $pill1 = Add-Card -slide $slide -left 132 -top 292 -width 196 -height 62 -fillR 30 -fillG 41 -fillB 59
    $pill2 = Add-Card -slide $slide -left 382 -top 292 -width 196 -height 62 -fillR 30 -fillG 41 -fillB 59
    $pill3 = Add-Card -slide $slide -left 632 -top 292 -width 196 -height 62 -fillR 30 -fillG 41 -fillB 59
    $pill1.Line.ForeColor.RGB = Get-Rgb 45 212 191
    $pill2.Line.ForeColor.RGB = Get-Rgb 245 158 11
    $pill3.Line.ForeColor.RGB = Get-Rgb 96 165 250
    $pill1Text = Add-TextBox -slide $slide -left 146 -top 314 -width 168 -height 20 -text "source-grounded" -fontName "Aptos Display" -fontSize 16 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $pill2Text = Add-TextBox -slide $slide -left 396 -top 314 -width 168 -height 20 -text "retrieval-first" -fontName "Aptos Display" -fontSize 16 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    $pill3Text = Add-TextBox -slide $slide -left 646 -top 314 -width 168 -height 20 -text "inspectable" -fontName "Aptos Display" -fontSize 16 -r 248 -g 250 -b 252 -bold $true -paragraphAlign 2
    Add-AnimSet $slide @($pill1, $pill1Text)
    Add-AnimSet $slide @($pill2, $pill2Text)
    Add-AnimSet $slide @($pill3, $pill3Text)

    $qa = Add-TextBox -slide $slide -left 112 -top 404 -width 736 -height 44 `
        -text "Recommended close: show the chat flow, open the statute modal, and end on the fact that the system exposes its evidence instead of hiding it." `
        -fontName "Aptos" -fontSize 16 -r 203 -g 213 -b 225 -paragraphAlign 2
    Add-Anim $slide $qa

    Add-Note $slide @"
6:15-7:00
Finish by returning to the core promise: evidence first.
If you are presenting live, this is where you either open the product or pause for Q and A.
The line to leave them with: the system shows its work.
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
