"""Create explicitly fictional local test PDFs; generated files are never tracked."""
from pathlib import Path
import fitz


PAGES = [
    ('人力资源服务采购项目  虚构测试样本', [
        '本文件为 WhaleTalk 开发测试编写，不对应真实客户或采购活动。',
        '第一章 项目概况与资格条件',
        '项目名称：示例园区人力资源外包服务项目。采购单位：虚构示例采购单位。',
        '服务期限：自合同签订之日起12个月。采购预算及最高限价：人民币120万元。',
        '采购范围：招聘交付、人员到岗管理、月度服务报告及人员替补协调。',
        '配置要求：项目经理1名，招聘顾问2名，驻场专员2名，共5名项目人员。',
        '服务要求：接到有效招聘需求后3个工作日内提交首批候选人资料。',
        '每月提交服务报告，包含到岗人数、人员变动、问题处理与下月计划。',
        '供应商应具备有效营业执照及与本项目适用业务相符的人力资源服务许可。',
        '本项目不接受联合体投标。联合体投标将被认定为无效投标。',
        '投标文件缺少法定代表人或授权代表签字的，投标无效。',
    ]),
    ('第二章 评分要求  虚构测试样本', [
        '本项目采用综合评分法，满分100分。商务部分20分，技术部分80分。',
        '商务部分：价格20分，按公式计算：价格得分=评标基准价/投标报价×20。',
        '评标基准价为通过资格与符合性检查的有效投标中的最低报价。',
        '技术部分：服务实施方案30分、团队配置20分、质量管理20分、应急预案10分。',
        '服务实施方案：流程完整且时限明确得21至30分，一般得11至20分，较差得0至10分。',
        '团队配置：岗位安排、职责分工、人员能力满足要求，最高20分。',
        '证明材料：提交拟派人员简历及相关经历证明；未提供相应证明的该项不得分。',
        '质量管理：考核指标、过程检查及改进机制合理，最高20分。',
        '应急预案：提供人员离岗、突发需求及交付延期的应对措施，最高10分。',
        '注意：评分项未提供证明的扣分，不自动等于无效投标。',
    ]),
    ('第三章 商务条件与递交要求  虚构测试样本', [
        '付款方式：按季度验收合格后支付对应服务费用。',
        '报价应涵盖服务管理成本及完成采购范围所需费用。',
        '投标报价超过最高限价的，投标将被否决。',
        '投标文件应包括资格文件、服务方案、团队资料、报价表及签字盖章页。',
        '递交截止时间：2026年12月10日10时00分。逾期递交的投标文件将被拒绝。',
        '投标有效期：自递交截止之日起90日。',
        '拟采用的服务承诺须由投标企业审核确认，企业资料不得虚构。',
        '文件结束。本样本仅用于软件测试，实际业务须使用获授权的招标文件。',
    ]),
]


def create_samples(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    for heading, lines in PAGES:
        page = doc.new_page(width=595, height=842)
        page.insert_text((45, 60), heading, fontname='china-s', fontsize=17)
        y = 115
        for line in lines:
            # Wrap at a conservative Chinese character width.
            for start in range(0, len(line), 40):
                page.insert_text((45, y), line[start:start+40], fontname='china-s', fontsize=12)
                y += 23
            y += 12
    doc.save(directory / 'fictional-tender.pdf')
    scan = fitz.open()
    page = scan.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=doc[1].get_pixmap(matrix=fitz.Matrix(1.8,1.8)).tobytes('png'))
    scan.save(directory / 'scanned-tender.pdf')
    mixed = fitz.open()
    page = mixed.new_page(width=595, height=842)
    page.insert_text((45, 40), '图文混合识别测试 虚构样本', fontname='china-s', fontsize=14)
    page.insert_image(fitz.Rect(20,65,575,815), stream=doc[1].get_pixmap(matrix=fitz.Matrix(1.8,1.8)).tobytes('png'))
    mixed.save(directory / 'mixed-tender.pdf')
    return directory / 'fictional-tender.pdf'


if __name__ == '__main__':
    print(create_samples(Path(__file__).resolve().parents[1] / 'data/examples'))
