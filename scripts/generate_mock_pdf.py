"""
Generates mock_skeleton_wc.pdf — a fake High Court skeleton argument
containing 12 citations that exercise FABRICATED / MISAPPLIED / VERIFIED.

Run: python3 backend/scripts/generate_mock_pdf.py
Output: backend/tests/fixtures/mock_skeleton_wc.pdf
"""
from pathlib import Path

PAGE_1 = """
IN THE HIGH COURT OF JUSTICE
KING'S BENCH DIVISION
COMMERCIAL COURT

Claim No. KB-2024-001234

BETWEEN:

NEXUS GLOBAL TRADING LTD              Claimant

and

AXIOM FINANCIAL SERVICES PLC          Defendant

SKELETON ARGUMENT ON BEHALF OF THE CLAIMANT

I. INTRODUCTION

1. This is an application for (i) a without-notice interim injunction and (ii) damages
   for tortious interference with the Claimant's economic relations with its major
   trading partners.

II. LEGAL FRAMEWORK — DUTY OF CARE

2. The duty of care in tort is well established: Donoghue v Stevenson [1932] AC 562.
   The neighbour principle extends to commercial relationships where loss is foreseeable.

3. For economic loss arising from the Defendant's representations, the Claimant relies
   on Hedley Byrne & Co Ltd v Heller & Partners Ltd [1964] AC 465, which establishes
   a general duty of care applicable to claims of tortious interference with economic
   relations. [MISAPPLIED — Hedley Byrne is about negligent misstatement, not tortious
   interference]

4. The foundational authority for the present claim in economic tort is
   OBG Ltd v Allan [2007] UKHL 21, which unified the law on intentional interference.

5. The principle of inducing breach of contract, upon which the Claimant additionally
   relies, is established in Lumley v Gye (1853) 2 El & Bl 216.

III. INTERIM INJUNCTIVE RELIEF

6. The test for a without-notice injunction is set out in
   American Cyanamid Co v Ethicon Ltd [1975] AC 396: the Court must be satisfied that
   (i) there is a serious question to be tried, (ii) damages would not be an adequate
   remedy, and (iii) the balance of convenience favours the grant.

7. The Claimant further relies on Pemberton v Richards [2019] EWHC 1234 for the
   proposition that a without-notice order may be granted where there is evidence
   of imminent dissipation of assets. [FABRICATED — this case does not exist]

8. See also Hamilton Estates Ltd v Croft & Sons [2018] UKSC 44, which confirmed
   the Court's jurisdiction to grant freezing orders in anticipation of enforcement.
   [FABRICATED — this case does not exist]
"""

PAGE_2 = """
IV. DAMAGES

9. The measure of expectation damages in contract is governed by
   Hadley v Baxendale (1854) 9 Ex 341, which applies equally to claims in tort for
   economic loss caused by the Defendant's unlawful interference.
   [MISAPPLIED — Hadley v Baxendale is contract law; tort uses the foreseeability
   test from The Wagon Mound]

10. The Claimant claims exemplary damages in addition to compensatory damages.
    The available categories are set out in Rookes v Barnard [1964] AC 1129.

11. On causation, the Claimant relies on Kuwait Airways Corp v Iraqi Airways Co
    [2002] 2 AC 883, establishing that the but-for test applies where the Defendant's
    act was the direct cause of the loss.

12. The quantum of damages is further addressed in
    Morrison Holdings Ltd v Blake [2021] EWCA Civ 555, in which the Court of Appeal
    held that expectation damages in economic tort cases may include lost profits
    from terminated contracts. [FABRICATED — this case does not exist]

V. CRIMINAL LAW ANALOGY

13. For completeness, the Claimant notes the Supreme Court's recent restatement of
    accessory liability in R v Jogee [2016] UKSC 8, which confirms the strict
    intention requirement for joint enterprise — a principle analogous to the
    intentional interference standard applied here.

VI. CONCLUSION

14. For the reasons set out above, the Claimant respectfully invites the Court to
    grant the without-notice injunction sought and to award damages as claimed.

Counsel for the Claimant
Temple Chambers
London EC4Y 9AA
"""


def generate():
    out = Path("tests/fixtures/mock_skeleton_wc.pdf")
    out.parent.mkdir(parents=True, exist_ok=True)

    try:
        import fitz  # PyMuPDF
        doc = fitz.open()
        for content in [PAGE_1, PAGE_2]:
            page = doc.new_page()
            page.insert_text((50, 72), content, fontsize=10, fontname="helv")
        doc.save(str(out))
        doc.close()
        print(f"Generated: {out} ({out.stat().st_size} bytes)")

    except ImportError:
        txt_out = out.with_suffix(".txt")
        txt_out.write_text(PAGE_1 + PAGE_2)
        print(f"PyMuPDF not available for PDF creation — wrote TXT: {txt_out}")


if __name__ == "__main__":
    generate()
