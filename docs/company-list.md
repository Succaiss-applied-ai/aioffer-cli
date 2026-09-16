# 企业官网投递清单

快照日期：2026-09-16。本页由 `pnpm catalog:docs` 自动生成，与 README、工作台使用同一分类规则。

[返回 README](../README.md#哪些企业官网可以自动或半自动投递) · [维护与字段口径](catalog-maintenance.md)

按 **AI Offer 生产数据库**的公开有效、允许申请记录汇总，企业按来源企业名称去重；同一企业的校招、社招入口可有不同登录要求。链接保留源数据中的真实投递页，不猜测或改写为网站首页；个别源记录指向牛客等第三方招聘平台，表中显示实际域名，不将其伪称企业官网。

- **自动 / 免登录**：`jobPosting.application.loginRequirement.status = not_required`，对应 AI Offer 的 `auto_apply` 筛选。
- **半自动 / 需本人登录**：原始字段为 `required`，对应 AI Offer 的 `login_required` 筛选；“半自动”是 CLI 对需要本人登录、再由助手填写并确认提交的展示名称。
- 企业数与岗位数分开统计：**464 个企业名称，27296 个岗位**。自动 4 家、半自动 461 家，重叠 1 家（海目星激光），不能直接相加。

这是来源数据的投递入口分类，不是 464 家全部完成本 CLI 端到端验收的声明。适配器类型与历史成功记录作为补充信息，**不再作为企业或岗位白名单**。登录、验证码和最终提交仍遵守本人授权与确认；快照不会自动更新。

## 完整企业清单（464 个来源企业名称）

| 企业（来源名称） | 投递方式 | 免登录岗位 | 需登录岗位 | 官网 / ATS / 来源投递入口 |
| --- | --- | ---: | ---: | --- |
| 阿吉豆 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/yunhonggroup/148277#/job/a608121d-7acc-403f-8d82-9b93a81c1a8e/apply>) |
| 阿斯利康中国 | 半自动（需本人登录） | 0 | 184 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/astrazeneca/148833#/job/03cb564d-f169-4bb8-b520-b9a6c5a4daa7/apply>) |
| 阿特拉斯∙科普柯集团 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/atlascopcogroup/142305#/job/3e17d3c4-4d1b-481e-bb0d-8ef106e36b3d/apply>) |
| 阿特拉斯科普柯集团中国 | 半自动（需本人登录） | 0 | 122 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/atlascopcogroup/150203#/job/00a38462-623f-4e47-af5e-dfba9a1fa493/apply>) |
| 艾达乐博 | 半自动（需本人登录） | 0 | 33 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/zqxmkw/148707#/job/0400306d-8e9c-497c-8bc9-be0f2e851dad/apply>) |
| 爱瑞无线 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/arraycomm/70372#/job/11528d86-a385-4396-a63f-5c6215b21d18/apply>) |
| 安捷利美维-扩招 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/akmmv/45089#/job/199a976e-2174-4c26-9352-298d901e0397/apply>) |
| 安克创新 | 半自动（需本人登录） | 0 | 454 | [需登录：anker-in.jobs.feishu.cn 1](<https://anker-in.jobs.feishu.cn/campushirecn/position/detail/7485676874023061799>) |
| 安谋科技 | 半自动（需本人登录） | 0 | 19 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/armchina/68023#/job/06a4d7f6-7f7c-4ad9-9f69-85df3f4c265f/apply>) |
| 安踏集团 | 半自动（需本人登录） | 0 | 156 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/antahr/142914#/job/027b4f8f-259b-467d-8c6c-0f23cf2fcf4f/apply>) |
| 安踏零售 | 半自动（需本人登录） | 0 | 16 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/antahr/140444#/job/0341a78e-900c-4381-bceb-946587af5647/apply>) |
| 昂际航电 | 半自动（需本人登录） | 0 | 16 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/aviagesystems/144382#/job/04b7eab5-37fa-4ca0-b81f-52d1a56dc284/apply>) |
| 昂立教育 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/onlyedu/144926#/job/124f8991-5ef5-4ebf-aa11-7de9af3524fd/apply>) |
| 翱捷科技 | 半自动（需本人登录） | 0 | 15 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/asrmicro/71887#/job/1f1254c4-261b-4252-8136-f368e70abb78/apply>) |
| 巴奴 | 半自动（需本人登录） | 0 | 1 | [需登录：banu.jobs.feishu.cn 1](<https://banu.jobs.feishu.cn/040175/position/detail/7665993012761250099>) |
| 百奥游戏 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/aobi/25016#/job/31478d14-0d89-49a7-82cd-d56194f41e00/apply>) |
| 百济神州-商业团队 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/beigene/118622#/job/48371b06-21e2-48fe-9ec3-58a2c2de1a26/apply>) |
| 百诺医药 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bestcomm/43337#/job/49fb166f-f5fe-4066-b0e5-2953a2601bdb/apply>) |
| 佰维存储 | 半自动（需本人登录） | 0 | 66 | [需登录：biwin1.zhiye.com 1](<https://biwin1.zhiye.com/campus/detail?jobAdId=001af9ed-db96-4e54-85b2-14d08edd7151>) |
| 拜耳 | 半自动（需本人登录） | 0 | 58 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bayer/148388#/job/053cdfc5-e0b6-44f7-9af3-af3b9ea91804/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/bayer/148387#/job/0045adc3-5a6e-4b14-ae26-21dbc04006f1/apply>) |
| 保隆科技 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/baolong/45778#/job/05cb2f40-d931-4b69-935e-30fafbc744f8/apply>) |
| 北极雄芯 | 半自动（需本人登录） | 0 | 21 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bjxx/150171#/job/1d69a102-cdda-4e0c-a539-ff347d767d4b/apply>) |
| 北京北森云计算股份有限公司 | 自动（免登录） | 2 | 0 | [免登录：www.nowcoder.com 1](<https://www.nowcoder.com/jobs/detail/430170>) |
| 北京润科 | 半自动（需本人登录） | 0 | 47 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jingweirunke/170057#/job/01358043-08df-43ec-a625-c8cf3cea86ba/apply>) |
| 北京先进数通信息技术股份公司 | 半自动（需本人登录） | 0 | 3 | [需登录：adtec.com.cn 1](<https://adtec.com.cn/content/details_15_1939.html>) · [需登录：www.adtec.com.cn 2](<https://www.adtec.com.cn/content/details_15_1942.html>) |
| 比逊医疗 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/medbanks/150528#/job/ae110ddf-e2c9-4fe4-afed-2362342830db/apply>) |
| 比亚迪 | 半自动（需本人登录） | 0 | 534 | [需登录：job.byd.com 1](<https://job.byd.com/portal/pc/#/social/socialPositionDetails?+1vJlw6yjCKrEpx+Q3CHdBaq7W1mNdoHTtfbAY4Ywd4=>) |
| 毕马威 | 半自动（需本人登录） | 0 | 204 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kpmg/74356#/job/003e3680-9b42-44b9-ab10-8513cbb6b7c9/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/kpmg/78342#/job/1b8b6291-a98b-4316-a819-16894c6f99b0/apply>) |
| 毕马威中国全球日本业务发展中心 | 半自动（需本人登录） | 0 | 186 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kpmg/76195#/job/03f36312-7870-47f7-8135-6fff167d75ae/apply>) |
| 壁仞科技 | 半自动（需本人登录） | 0 | 30 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/biren/44727#/job/19008925-e752-4f00-9d38-b9775a066f34/apply>) |
| 编程猫 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/codemaohr/37503#/job/b21b42ee-3f26-4548-bdd5-f8688684490e/apply>) |
| 波士顿科学 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bostonscientific2025/144081#/job/5e55a807-5618-49f2-9a4d-f903eb548f05/apply>) |
| 玻色量子 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/boseq/140969#/job/15409061-942c-4f68-a788-4ee74fb56d68/apply>) |
| 博乐科技 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/bolegames/37642#/job/2095d550-602d-44e5-98fc-42c6a09e219d/apply>) |
| 博迈医疗 | 半自动（需本人登录） | 0 | 21 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/brosmed/146155#/job/01f63376-1a8e-46a1-ae13-ca6c43775348/apply>) |
| 博世中国 | 半自动（需本人登录） | 0 | 67 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bosch/73873#/job/053d5ca5-f35e-4ef8-83b4-3b28c57f954c/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/bosch/75909#/job/02fd0212-6af4-47be-a1af-669c236c81a6/apply>) |
| 博世中国创新与软件开发中心 | 半自动（需本人登录） | 0 | 227 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bosch/151492#/job/0224b7a7-d2e8-4714-a754-66e76982c7f1/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/bosch/67942#/job/0067f1ca-a4e9-4b70-817a-3f0653542138/apply>) |
| 博思软件 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bosssoft/68370#/job/b345d550-c22c-415d-8782-1b51fcd03edf/apply>) |
| 博西家电 | 半自动（需本人登录） | 0 | 88 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/bshg/140686#/job/1a37ad75-8904-4c7f-8ca1-666ea9a3d3b4/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/bshg/28741#/job/1e3e0538-d9aa-409e-9bb9-9d94f1e12ac9/apply>) |
| 博西家电-战略实习生项目 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/bshg/171901#/job/02294a58-3e9a-47ce-b18a-e952c6cc514d/apply>) |
| 禅游科技 | 半自动（需本人登录） | 0 | 24 | [需登录：zen-game.jobs.feishu.cn 1](<https://zen-game.jobs.feishu.cn/679976/position/detail/7640055214943439154>) |
| 朝云集团 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cheerwin/147205#/job/0148ca1f-1113-4453-9adf-161d04db520b/apply>) |
| 厨芯科技 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/honganrobots/150155#/job/7a264164-e10e-4ee5-bc7c-bec1a97602c6/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/honganrobots/6118#/job/6a1b2414-9da7-4a10-a01f-5d83accd9048/apply>) |
| 传化集团 | 半自动（需本人登录） | 0 | 63 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/wynca/92577#/job/0e15ef68-245b-4567-b11e-3357139dda9b/apply>) |
| 传音 | 半自动（需本人登录） | 0 | 356 | [需登录：transsion.zhiye.com 1](<https://transsion.zhiye.com/campus/detail?jobAdId=00ad79ad-15a8-4c60-a77a-2186fc37cc7e>) |
| 聪链集团 | 半自动（需本人登录） | 0 | 10 | [需登录：intchains.jobs.feishu.cn 1](<https://intchains.jobs.feishu.cn/749649/position/detail/7414457649234577714>) |
| 达美乐中国 | 半自动（需本人登录） | 0 | 20 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dominos/118054#/job/0419289d-efb4-4195-a698-c6e03b28520f/apply>) |
| 大丰 | 半自动（需本人登录） | 0 | 12 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dafeng/142387#/job/01ca9bed-47ab-46b5-a737-68da2acf5ecb/apply>) |
| 大华集团-菁华生 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dahua/118041#/job/00d19405-0e31-4735-8b3f-fedebef77e88/apply>) |
| 大疆创新 | 半自动（需本人登录） | 0 | 473 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/dji/170070#/job/000509fb-0983-439b-b5d1-7f2cdb972b4e/apply>) · [需登录：apply.careers.dji.com 2](<https://apply.careers.dji.com/social-recruitment/dji/170070#/job/01b208bd-8b8e-47ac-b8a5-9fcd82271ea0/apply>) |
| 大梦龙途 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/damenglongtu/36328#/job/35a802e6-ac11-4212-b0b3-dad44bf407e0/apply>) |
| 大有泰 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dayoutai/141037#/job/1770965d-1ea9-4df9-924b-8c87fe6a5c98/apply>) |
| 大众汽车集团 | 半自动（需本人登录） | 0 | 48 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/vwa/118095#/job/101a3bef-74ca-445d-8ddf-110c7f11b8e0/apply>) |
| 大众中国-实习岗位上新 | 半自动（需本人登录） | 0 | 50 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/vwa/142785#/job/01b62406-4e7f-45a0-a7b1-7fe9beb0e7f7/apply>) |
| 大族激光 | 半自动（需本人登录） | 0 | 36 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hanslaser/46383#/job/015ac91e-19ff-46f7-a557-328f3f5f00cd/apply>) |
| 戴盟机器人 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/daimon-robotics/148583#/job/2c466f90-1ec1-442d-8d3f-52537b4a010d/apply>) |
| 当升科技 | 半自动（需本人登录） | 0 | 15 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/easpring/102152#/job/1ac95fe0-ea8a-4748-b065-735cd0d9cd28/apply>) |
| 道远咨询 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/blackhills/76097#/job/0ae90543-48b2-48eb-abc6-c2f6799a3bdd/apply>) |
| 得物App | 半自动（需本人登录） | 0 | 167 | [需登录：poizon.jobs.feishu.cn 1](<https://poizon.jobs.feishu.cn/578078/position/detail/7566577510222956851>) |
| 得一微 | 半自动（需本人登录） | 0 | 29 | [需登录：yeestor.zhiye.com 1](<https://yeestor.zhiye.com/campus/detail?jobAdId=09fc7c22-1a8f-4835-8c4d-12379dc2643f>) |
| 德邦基金 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/imtebon/116246#/job/04c1f639-ddb9-4f88-9ccd-83276374fb7b/apply>) |
| 德方纳米 | 半自动（需本人登录） | 0 | 25 | [需登录：dynanonic.zhiye.com 1](<https://dynanonic.zhiye.com/social/detail?jobAdId=03aaa60c-0a39-401d-baf3-38ef6de1edb0>) |
| 德州仪器 | 半自动（需本人登录） | 0 | 63 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ti/143986#/job/02cb5b55-d43e-4f2a-9226-e5ac61f1a592/apply>) |
| 滴滴（不限专业） | 半自动（需本人登录） | 0 | 150 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/didiglobal/96064#/job/0068bc02-c105-41e9-9974-9532c7778bdd/apply>) |
| 迪安诊断 | 半自动（需本人登录） | 0 | 20 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dazd/147092#/job/022bbc74-1f54-4584-84a1-9973834ea2ca/apply>) |
| 点众科技 | 半自动（需本人登录） | 0 | 30 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dianzhong/28122#/job/436c8485-31c1-4b08-ad17-14176a719618/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/dianzhong/29071#/job/038098a4-d809-49d9-b6a4-7eadf1a6535d/apply>) |
| 电魂网络 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dianhun/55953#/job/0e4c542c-77c7-450c-b5ce-d0e07fd83f62/apply>) |
| 电科金仓 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kingbase/47259#/job/02cfdb13-ca4b-40d4-bf78-3751fbe202f2/apply>) |
| 鼎信通讯 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/topscomm/72082#/job/10e205b3-75ce-4094-87f9-6899d007ce7c/apply>) |
| 东方财富证券 | 半自动（需本人登录） | 0 | 101 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/eastmoney/57971#/job/089aa984-3831-4f6f-9331-78609002d295/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/eastmoney/92400#/job/000d1a5d-9d6c-4c02-95f1-3dece4489221/apply>) |
| 东方海外·珠海货讯通科技 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/oocl/44733#/job/cf5fd368-0592-4ed4-a63f-084b5de64138/apply>) |
| 东方红资产管理 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dfzq/40132#/job/6e7cdc51-87c8-4585-8d4c-32238b7c4144/apply>) |
| 东风奕派汽车 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dfmc/182169#/job/99075fb2-ac1e-46e5-9926-66aff0c0a246/apply>) |
| 懂车帝 | 半自动（需本人登录） | 0 | 131 | [需登录：dcar.jobs.feishu.cn 1](<https://dcar.jobs.feishu.cn/campus/position/detail/7316727146570713394>) |
| 多比特信息 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/wedobest/46167#/job/4a79f9df-72da-44bd-b4e7-eea96747cba4/apply>) |
| 多维联合集团 | 半自动（需本人登录） | 0 | 30 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/duowei/142740#/job/045b1fd3-118e-42f3-a80a-e1b5c2699b6c/apply>) |
| 法本信息 | 半自动（需本人登录） | 0 | 17 | [需登录：farben.zhiye.com 1](<https://farben.zhiye.com/campus/detail?jobAdId=02f68f69-6f60-466f-a8dc-33ad70b16ae8>) |
| 方舟健客 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jianke-fangzhou/44310#/job/3e33ad39-31ce-485a-aa7a-96d11272a820/apply>) |
| 飞鱼科技 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/feiyu/142123#/job/14c3e165-7e8c-41f5-9cb9-ad69cb09cbfd/apply>) |
| 非凸科技 | 半自动（需本人登录） | 0 | 25 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/ftkj/146869#/job/06cbc34e-b702-4ae2-9f4b-bac917a2b851/apply>) |
| 菲亚兰德集团 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fairlandgroup/75892#/job/002e5c02-8230-4c3c-b5e5-f5fbc4a35e4c/apply>) |
| 费森尤斯卡比中国 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fresenius/150661#/job/19ff9c56-072f-4f0e-b509-64ec26227362/apply>) |
| 伏达半导体 | 半自动（需本人登录） | 0 | 12 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/nuvoltatech/29077#/job/0acd9689-313b-4b3d-a9fb-fd1b4e23af54/apply>) |
| 佛吉亚 | 半自动（需本人登录） | 0 | 61 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/faurecia/146093#/job/0090cb93-d168-4e78-9179-ba53ffb9bcea/apply>) |
| 福龙马集团 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fjlm/128157#/job/9b6a7c2d-ce4d-4406-b9d6-3c58cb53ac4b/apply>) |
| 复星财富控股 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fosunwealth/146703#/job/645d553f-880a-4318-a12f-da38207cfb55/apply>) |
| 傅利叶 | 半自动（需本人登录） | 0 | 25 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fftai/147078#/job/046ed323-4fb7-4e7c-a0d5-9f78d972d6c4/apply>) |
| 富德生命人寿 | 半自动（需本人登录） | 0 | 61 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sino-life/149337#/job/001257ca-f8d6-4768-abb1-fdf3d7c4b0e4/apply>) |
| 富特科技 | 半自动（需本人登录） | 0 | 32 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/evtech/47503#/job/059fc3b0-6690-44e1-996c-c5bf0c497c95/apply>) |
| 富途-研发岗位专场 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/futu5/141186#/job/0f7837f6-2b08-4e7c-b085-dbfcc5b07e44/apply>) |
| 高露洁 | 半自动（需本人登录） | 0 | 33 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/colpal/28788#/job/02c909ad-f343-414b-8661-ebe11521e386/apply>) |
| 高途 | 半自动（需本人登录） | 0 | 198 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bjhl/102145#/job/01c0c470-88ea-43b9-a1c1-4b0acc2764f6/apply>) |
| 格力半导体 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/gree-epac/150470#/job/370b935a-9ddb-4b5f-ad7d-f13182addd99/apply>) |
| 古茗茶饮 | 半自动（需本人登录） | 0 | 60 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/guming/39377#/job/00ac7b0c-a98e-495e-8f0b-093c3a00e680/apply>) |
| 广立微 | 半自动（需本人登录） | 0 | 35 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/semitronix/140043#/job/0730df7e-e609-4594-b0ff-d0f23ba229cb/apply>) |
| 广联达 | 半自动（需本人登录） | 0 | 18 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/glodon/91966#/job/15028109-353b-43b3-b579-7d8f8b7f84f2/apply>) |
| 广汽高域 | 半自动（需本人登录） | 0 | 17 | [需登录：govy.jobs.feishu.cn 1](<https://govy.jobs.feishu.cn/693065/position/detail/7485675831726836031>) |
| 国科天迅 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tasson/69872#/job/04a6af6e-289e-43bc-8d95-5597af1594b1/apply>) |
| 国科长三角资本 | 半自动（需本人登录） | 0 | 7 | [需登录：n0kwkp76gi.jobs.feishu.cn 1](<https://n0kwkp76gi.jobs.feishu.cn/campus/position/detail/7633332869415684390>) |
| 国泰君安期货 | 半自动（需本人登录） | 0 | 62 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/gtjaqh/118667#/job/015522f1-1f2e-4bfa-b355-942688237504/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/gtjaqh/136276#/job/0a3ba731-e75c-4cfb-b73f-79d365d67830/apply>) |
| 哈乐沃德 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hellowdtest/38235#/job/4521b5a8-b0dc-4a98-b17b-19012e27eb79/apply>) |
| 海豹集团-厦门她趣-他趣 | 半自动（需本人登录） | 0 | 1 | [需登录：o15vj1m4ie.jobs.feishu.cn 1](<https://o15vj1m4ie.jobs.feishu.cn/980028/position/detail/7605800532876757289>) |
| 海大集团 | 半自动（需本人登录） | 0 | 26 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/haid/101909#/job/008a9a05-316d-4399-abc1-5debc55bf191/apply>) |
| 海光信息 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hygon/169939#/job/122ac6bf-a1ae-4685-9e6d-5739a2c50d01/apply>) |
| 海目星激光 | 自动（免登录）、半自动（需本人登录） | 82 | 55 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hymson/144827#/job/07a4196c-aa10-4c88-9c84-c79c6f969526/apply>) · [免登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/hymson/144826#/job/09531c24-46d7-44c9-bc9d-16f3b0e88147/apply>) |
| 海南省财金集团有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hncjjt/150651#/job/3267dc3e-b323-4699-88c7-e682e507ad24/apply>) |
| 海南数金信息技术 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/hncjjt/148960#/job/1811530c-fb89-4cb4-8a58-6e2bac498def/apply>) |
| 海能达 | 半自动（需本人登录） | 0 | 53 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hytera/182194#/job/00559c52-dd2c-4193-a501-81f8905d01af/apply>) |
| 海艺互娱 | 半自动（需本人登录） | 0 | 25 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/haiyi/150699#/job/02e2161f-bbc3-47d9-ba7a-084ff1068cba/apply>) |
| 涵德投资 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/handetouzi/46040#/job/0e23e8b3-1be7-4af7-a280-b4c5b8d41601/apply>) |
| 寒武纪 | 半自动（需本人登录） | 0 | 60 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cambricon/44201#/job/02b7a8f4-f602-4f65-8383-3089efb2d54a/apply>) |
| 杭银消金 | 半自动（需本人登录） | 0 | 87 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/hyxj/102160#/job/00612d1d-24a1-4f34-93e8-b8d43587f7aa/apply>) |
| 杭州枫林火山科技有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：www.haolietou.com 1](<https://www.haolietou.com/j_335149>) |
| 杭州铭师堂 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/mistong1/140555#/job/511bf5ba-ec14-4d1d-87a5-9290b6604de4/apply>) |
| 好课在线 | 半自动（需本人登录） | 0 | 22 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zuoyebang/148035#/job/1b9021cb-abbf-4e64-ac1b-0a730ff69445/apply>) |
| 好未来 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tal/147459#/job/1e918151-6cf0-4f0e-aa8b-9fd94bb354d0/apply>) |
| 好未来学而思 | 半自动（需本人登录） | 0 | 98 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tal/95443#/job/0743925b-8c49-4da5-8752-08ca19a5b1d3/apply>) |
| 禾丰股份 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hfsp/37149#/job/57451bcb-89a2-4b2d-9081-b4e62da839d9/apply>) |
| 禾迈股份 | 半自动（需本人登录） | 0 | 55 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hoymiles/70377#/job/017d8150-fae5-47c3-9b09-e119a0a5f8cd/apply>) |
| 和而泰 | 半自动（需本人登录） | 0 | 30 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/het0000001/142804#/job/02091933-f565-422b-9ba4-3f3b629eeb9c/apply>) |
| 黑翼资产 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/blackwingasset1/147370#/job/061edebe-7961-46ec-9ebf-eb0bfc35ade1/apply>) |
| 恒瑞医药 | 半自动（需本人登录） | 0 | 339 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hengrui/145997#/job/00dbe723-f48a-4174-b774-5c4e4102ef41/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/hengrui/148744#/job/06abbe60-2c8a-48f4-8e1d-b74b9bcd2ebc/apply>) |
| 红松集团 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hongsong/72062#/job/07247683-609a-43c7-85bc-c694f8164542/apply>) |
| 鸿钧微电子 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hjmicro/54317#/job/0404f18c-7396-401c-a90b-901a44b34db0/apply>) |
| 虎牙 | 半自动（需本人登录） | 0 | 49 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/huya/4112#/job/052328f7-428e-4faf-ab43-8e7be3b87277/apply>) |
| 华东医药 | 半自动（需本人登录） | 0 | 31 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/eastchinapharm/67935#/job/001fe298-a0ea-47c8-aa31-24ed158221cd/apply>) |
| 华港财富集团 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fargowealth/141080#/job/be1ce6bb-7e34-4179-af43-bf0cb5b88c6d/apply>) |
| 华虹集团 | 半自动（需本人登录） | 0 | 66 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/huahong/78009#/job/00800047-59e2-4f88-a3d1-819c138959e2/apply>) |
| 华米科技（Zepp Health） | 半自动（需本人登录） | 0 | 55 | [需登录：zepp.jobs.feishu.cn 1](<https://zepp.jobs.feishu.cn/index/position/detail/7209937995184245053>) |
| 华勤技术 | 半自动（需本人登录） | 0 | 86 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hq/45417#/job/1ce79388-884e-4edb-9b06-b6a54fe865b8/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/hq/91927#/job/057934d6-a812-44b0-996a-846920a9ad2c/apply>) · [需登录：app.mokahr.com 3](<https://app.mokahr.com/social-recruitment/hq/44756#/job/09a95c5f-8bcc-4be2-93ba-56116a8862c9/apply>) |
| 华勤技术-补录 | 半自动（需本人登录） | 0 | 49 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hq/44757#/job/0b47c7e1-e313-46af-b034-73006898d3e1/apply>) |
| 华为 | 半自动（需本人登录） | 0 | 79 | [需登录：career.huawei.com 1](<https://career.huawei.com/cn/job-details?advertisementId=30881>) |
| 华兴资本 | 半自动（需本人登录） | 0 | 12 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/huaxing/6790#/job/16576cb1-6bc6-4114-8826-c228c134eb3a/apply>) |
| 辉瑞 | 半自动（需本人登录） | 0 | 24 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/pfizercampus/142244#/job/0207bdb7-193f-4343-bf07-b54a1a8d2c56/apply>) |
| 货拉拉 | 半自动（需本人登录） | 0 | 43 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/huolalahr/98660#/job/046be72e-81f0-459d-a91a-f0909e28a13c/apply>) |
| 积加科技 | 半自动（需本人登录） | 0 | 3 | [需登录：a4x-paas.jobs.feishu.cn 1](<https://a4x-paas.jobs.feishu.cn/500117/position/detail/7623347725286787369>) |
| 基蛋生物 | 半自动（需本人登录） | 0 | 25 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/getein/74361#/job/24c29736-5a94-44eb-a801-c4f45969c7b5/apply>) |
| 基克纳·奇思 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/geekvape/149019#/job/463ed978-2870-4888-b4aa-1cff1dc86889/apply>) |
| 吉客印 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/giikin/94708#/job/1e09958b-01d3-48b8-b44f-532c8f7883f3/apply>) |
| 吉利控股集团 | 半自动（需本人登录） | 0 | 1726 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/geely/78436#/job/000176f3-d8c3-44f8-a774-80b34486d991/apply>) |
| 极石汽车 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/roxmotor#/job/abcb19ae-037b-4ffb-9312-46576223a06c/apply>) |
| 极智嘉 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/geekplus/165879#/job/2af5a436-bb45-46a8-b249-912d7d7617cd/apply>) |
| 集益威半导体 | 半自动（需本人登录） | 0 | 15 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/joywellsemi/166372#/job/37ad24f6-fe50-4542-9c07-0897192c1084/apply>) |
| 加特兰微电子 | 半自动（需本人登录） | 0 | 24 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/calterah/1109#/job/0a221f8f-934f-4b11-906d-ec6d44e9092e/apply>) |
| 佳兆业集团 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kaisa/151009#/job/3843f121-b947-48e6-99de-562b6f08cac5/apply>) |
| 嘉实基金 | 半自动（需本人登录） | 0 | 22 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jsfund/43906#/job/21a3c67b-05d8-4f96-8635-0099319abfb3/apply>) |
| 见山科技 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jianshankeji/100134#/job/394b8e90-6459-4304-9904-5e6d22c98427/apply>) |
| 江波龙 | 半自动（需本人登录） | 0 | 24 | [需登录：longsys.zhiye.com 1](<https://longsys.zhiye.com/campus/detail?jobAdId=0da8db9d-9c79-461d-84f7-afd7ea43213a>) |
| 焦点科技 | 半自动（需本人登录） | 0 | 58 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/focus/148405#/job/017ed736-25e1-4b04-ba52-f2eb0908a745/apply>) |
| 阶跃-StepStar顶尖人才计划 | 半自动（需本人登录） | 0 | 19 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/step/141903#/job/3a1ae63e-c80f-4b33-91db-5f71718b83b7/apply>) |
| 金蝶 | 半自动（需本人登录） | 0 | 213 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kingdeehr/166565#/job/014db485-b99d-4651-a32d-3b830ba17119/apply>) |
| 金光集团APP(中国) | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jinguangapp/146948#/job/5311f2dc-e0dc-4cd0-9ea1-e84be13d14cb/apply>) |
| 金光集团APP（中国） | 半自动（需本人登录） | 0 | 40 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jinguangapp/144102#/job/052591f3-eb2e-4ce1-a967-47ce35598286/apply>) |
| 金赛药业 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/gensci/144980#/job/02160df3-f378-4917-bf08-6a3c401571f6/apply>) |
| 金山办公-管培生专项 | 半自动（需本人登录） | 0 | 37 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/wps/41436#/job/06e9bb1b-4a6e-4810-8130-68ad894155e7/apply>) |
| 金斯瑞 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/genscript/93923#/job/361e678b-95d4-45cb-b2ef-48c5316a63b1/apply>) |
| 金斯瑞-补录 | 半自动（需本人登录） | 0 | 15 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/genscript/101964#/job/0ee2bd4d-1897-401a-97a9-806a463185ac/apply>) |
| 金证股份 | 半自动（需本人登录） | 0 | 14 | [需登录：szkingdom.zhiye.com 1](<https://szkingdom.zhiye.com/campus/detail?jobAdId=0e13be50-be2c-4818-9600-d93c56b66dc6>) |
| 锦泓时装集团 | 半自动（需本人登录） | 0 | 34 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/vgrass/141156#/job/03de252b-7237-48bf-8aaf-3474edb0e02e/apply>) |
| 进迭时空 | 半自动（需本人登录） | 0 | 28 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/space-t1/67916#/job/05a5a8f0-ab21-41ed-ba95-3d8aa0c0448a/apply>) |
| 经纬恒润 | 半自动（需本人登录） | 0 | 726 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jingweihengrun/168294#/job/0032fd43-0c32-411c-a876-6c7617b871c0/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/jingweihengrun/168299#/job/01e0decb-a946-48b0-8a1e-367f9a8d4cdb/apply>) |
| 晶科储能 | 半自动（需本人登录） | 0 | 15 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jinkosolar/151013#/job/0fde3cd3-f977-40b8-93a3-9642eaeba14b/apply>) |
| 晶科科技 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jinko/46987#/job/36cf8f58-7182-4909-b3c2-613496f6807f/apply>) |
| 晶科能源 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jinkosolar/41896#/job/375388b1-1411-4e69-95cc-38664dc0b97c/apply>) |
| 晶泰科技 | 半自动（需本人登录） | 0 | 39 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jingtai/2143#/job/01ad21da-fe56-4c10-9ba7-ac0cba4effa3/apply>) |
| 精臣 | 半自动（需本人登录） | 0 | 46 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/niimbot/45368#/job/04ccbf60-ce50-4101-9a54-2c21ed402534/apply>) |
| 九丰集团 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jovo/141182#/job/50a6e440-64b5-4317-9d1c-f35ef5316888/apply>) |
| 九坤投资 | 半自动（需本人登录） | 0 | 36 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ubiquantrecruit/37031#/job/0755d428-9754-442c-9a41-0360edf07e5c/apply>) |
| 九木杂物社 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/mg/142712#/job/1e24ef95-100b-4514-b075-15ea9784ee88/apply>) |
| 九洲药业 | 半自动（需本人登录） | 0 | 27 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jiuzhoupharma/74059#/job/01759d45-68fd-46db-a822-71c694f21eeb/apply>) |
| 橘宜集团 | 半自动（需本人登录） | 0 | 90 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/joy-group/96205#/job/02a54de8-4dc9-49de-9309-f879e2c36c0f/apply>) |
| 巨人网络 | 半自动（需本人登录） | 0 | 40 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ztgame/92438#/job/0082b482-873e-41c7-ad49-a8c6fdd37e12/apply>) |
| 巨人网络-美术类岗位 | 半自动（需本人登录） | 0 | 49 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/ztgame/37485#/job/01f22b2b-2769-4d8b-9a14-435e62d41322/apply>) |
| 聚宽投资 | 半自动（需本人登录） | 0 | 18 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/joinquant/92347#/job/0ddb0eda-920a-4908-9dd7-ff590d8b3763/apply>) |
| 聚芯微电子 | 半自动（需本人登录） | 0 | 22 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jxw/166492#/job/008d3711-1dbd-4bc4-a665-bfaa201f2bac/apply>) |
| 均胜集团 | 半自动（需本人登录） | 0 | 36 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/joyson/94311#/job/038d1e07-0787-4013-a8e2-8337aebb296f/apply>) |
| 凯读投资 | 半自动（需本人登录） | 0 | 12 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/kendallsquarecap/144869#/job/068ece1b-52ca-4e2f-9e76-14c692d4423d/apply>) |
| 康龙化成 | 半自动（需本人登录） | 0 | 236 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/pharmaron/44352#/job/002d1bb3-d791-43b7-8933-3c5d7563d880/apply>) |
| 柯马中国 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/comau/98394#/job/32b35e86-0323-4cf7-a3cd-3482c1c4b0e2/apply>) |
| 科达制造 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kedachina/78371#/job/018ad9a5-a6ee-4573-8f73-ff1296d7c064/apply>) |
| 科华集团 | 半自动（需本人登录） | 0 | 65 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kehua/92510#/job/00e5322d-bf45-468b-be4c-b7c02087e97d/apply>) |
| 酷哇科技 | 半自动（需本人登录） | 0 | 24 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cowarobot/43487#/job/1c9b313c-8f8a-496e-ba25-7511122ba541/apply>) |
| 快仓智能科技 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/flashhold/40527#/job/27c7a3eb-3bd9-4126-9268-c9f1059fbe01/apply>) |
| 快递100 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kuaidi100/118847#/job/7783a79f-97a0-4c69-93e0-75299fb4967e/apply>) |
| 徕芬 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/laifen/146139#/job/6e58b3b5-effb-4bcc-bf41-4c29f66b4333/apply>) |
| 岚图汽车 | 半自动（需本人登录） | 0 | 78 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/voyah/146293#/job/0a2ea55a-c0a5-4006-b0de-c7d21dc1c85c/apply>) |
| 蓝光智能 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/blovelight/45215#/job/22991f37-6669-4104-8986-9a07a904de12/apply>) |
| 乐歌股份 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/loctek/43967#/job/337d912a-5622-4852-a0c6-783a23581d3f/apply>) |
| 乐享元游 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yyxx/118480#/job/41540460-af5b-4912-b94c-19655d29b549/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/yyxx/118479#/job/05d7ffa2-f7a8-495b-93e5-1c1f95eb9c40/apply>) |
| 乐元素SH工作室 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/leyuansu/2357#/job/0d01324a-27f1-44aa-858c-053405539b4b/apply>) |
| 雷赛智能 | 半自动（需本人登录） | 0 | 16 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/leisai/146886#/job/099e0574-950b-4daa-b4db-e31ef934a2f7/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/leisai/115938#/job/0cb330c3-5009-43be-b395-1edcd5095918/apply>) |
| 雷特科技 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/morningfast/146810#/job/539889b3-94c1-41aa-8ccb-7b08d93a7d24/apply>) |
| 理然（MAKESENSE） | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/liran/37672#/job/09238abf-74bc-4ac4-a60e-ab3179e43d6f/apply>) |
| 理想汽车 | 半自动（需本人登录） | 0 | 757 | [需登录：li.jobs.feishu.cn 1](<https://li.jobs.feishu.cn/index/position/detail/7002528981677672718>) |
| 力勤集团 | 半自动（需本人登录） | 0 | 22 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/lygend/72100#/job/0816715b-74fd-4491-aaa4-d4af94a23c6a/apply>) |
| 利欧数字 | 半自动（需本人登录） | 0 | 28 | [需登录：leoglobal.jobs.feishu.cn 1](<https://leoglobal.jobs.feishu.cn/leoxz/position/detail/7673067859240618246>) |
| 荔枝集团 | 半自动（需本人登录） | 0 | 9 | [需登录：lizhi2021.jobs.feishu.cn 1](<https://lizhi2021.jobs.feishu.cn/044144/position/detail/7516431188149078291>) |
| 联想信息产品(深圳)有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：qinyangshi.jrzp.com 1](<https://qinyangshi.jrzp.com/job4085029.shtml>) |
| 灵感游戏 | 半自动（需本人登录） | 0 | 18 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/inspiregames/144680#/job/175748c3-9e00-44f6-81cc-e7d5bc244ee6/apply>) |
| 瓴岳科技 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fintopia/102255#/job/04528a50-d613-453b-bd02-a9d2cfc78ce2/apply>) |
| 凌久微 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ljmicro/102772#/job/40755d04-fd9b-4575-b7af-f24f01ee5cf3/apply>) |
| 凌云光 | 半自动（需本人登录） | 0 | 31 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/lusterinc/44882#/job/0ae782ed-554d-4368-80d1-2f1c4261f2dc/apply>) |
| 聆曦游戏 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/lingxihz/135942#/job/c33326d1-1ef0-4d14-86b9-95d9103807c4/apply>) |
| 零差云控（深圳）科技股份有限公司 | 自动（免登录） | 1 | 0 | [免登录：zeroerr.cn 1](<https://zeroerr.cn/work/66.html?t=1752824668595>) |
| 柳州市佰家邦家庭服务有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：www.lzrcgc.com.cn 1](<https://www.lzrcgc.com.cn/zhongsha/job/job.html?id=1626>) |
| 柳州五菱新能源 | 半自动（需本人登录） | 0 | 75 | [需登录：ai62vrthjus.jobs.feishu.cn 1](<https://ai62vrthjus.jobs.feishu.cn/index/position/detail/7338298705437018409>) |
| 绿盟科技 | 半自动（需本人登录） | 0 | 166 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/nsfocus/29118#/job/029637c5-3430-4a4a-833f-701ca52689ab/apply>) |
| 洛书投资 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/luoshu/39933#/job/3d088bc9-d4d1-4b07-a049-8167e57ede9b/apply>) |
| 曼伦-组织发展预习班 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/manon/94861#/job/ad3a9488-4079-4afe-866a-b3d3ee0985c2/apply>) |
| 玫德集团 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/meidegroup/142830#/job/40c9ff26-e53e-483f-8499-9652593948a8/apply>) |
| 梅塞尔中国-管培生 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/messer/92849#/job/3fd0e552-c7ae-4e80-b441-dcc818475391/apply>) |
| 美埃科技 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/mayair/142334#/job/273b77ee-92ce-4e2c-93d2-3c7989ba16fe/apply>) |
| 美宜佳 | 半自动（需本人登录） | 0 | 35 | [需登录：meiyijia.jobs.feishu.cn 1](<https://meiyijia.jobs.feishu.cn/campus/position/detail/7410683593066744100>) |
| 敏芯股份 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/memsensing/45045#/job/4a51ebf0-b902-4354-8a23-90adb321d234/apply>) |
| 沐瞳 | 半自动（需本人登录） | 0 | 94 | [需登录：moonton.jobs.feishu.cn 1](<https://moonton.jobs.feishu.cn/campus/position/detail/7602560576607602954>) |
| 沐曦股份 | 半自动（需本人登录） | 0 | 97 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/metax-tech/58131#/job/017badd9-39be-4fd9-9098-d9777a1b8c4f/apply>) |
| 牧原 | 半自动（需本人登录） | 0 | 39 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/muyuan/70116#/job/1d37e082-d555-4fb8-998f-879551570572/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/muyuan/74358#/job/009dee66-7157-4187-bb4f-57baf9714487/apply>) |
| 宁德时代 | 半自动（需本人登录） | 0 | 550 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/catlhr/148948#/job/00586bec-9325-4abd-8a8b-2edcb4043501/apply>) |
| 柠檬微趣 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/microfunhr/75944#/job/239530bc-944d-4526-b174-04ca5277618a/apply>) |
| 诺唯赞生物 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/vazyme/19898#/job/4015229f-9e4c-41e4-bec3-44858dc85875/apply>) |
| 诺亚控股 | 半自动（需本人登录） | 0 | 19 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/noah/70198#/job/075b2b02-4671-4ec8-82b5-811445a3a4f9/apply>) |
| 欧派家居集团 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/oppein/78240#/job/09f61bb4-2f2c-467d-aaca-ddda7d87eec8/apply>) |
| 鹏景科技 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/pengwin/145331#/job/bbb41b35-dc71-4dc8-b34c-5bbbbdfe6949/apply>) |
| 品驰医疗 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/pinsmedical/2726#/job/33f5a011-b712-498a-b28a-fe89d50ad5f1/apply>) |
| 平方和投资 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/alpha2fund/151124#/job/0e8b5fe7-f7c7-4839-9c93-d1e8073ba92c/apply>) |
| 普华永道 | 半自动（需本人登录） | 0 | 40 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/pwc/148260#/job/01640cf9-e0b6-4805-a606-213083e85e05/apply>) |
| 普联 TP-LINK | 半自动（需本人登录） | 0 | 68 | [需登录：hr.tp-link.com.cn 1](<https://hr.tp-link.com.cn/jobDetail/7517>) |
| 普源精电 | 半自动（需本人登录） | 0 | 24 | [需登录：rigolportal.jobs.feishu.cn 1](<https://rigolportal.jobs.feishu.cn/campus/position/detail/7647745205135296811>) |
| 千里智驾 | 半自动（需本人登录） | 0 | 131 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/qianli1/147197#/job/001afe73-f3ea-46b8-9c1b-21f44d56358f/apply>) |
| 千象资产 | 半自动（需本人登录） | 0 | 9 | [需登录：lfd4p99lg4.jobs.feishu.cn 1](<https://lfd4p99lg4.jobs.feishu.cn/index/position/detail/7153893629370517792>) |
| 千寻智能 | 半自动（需本人登录） | 0 | 61 | [需登录：nwd4iy9rd2s.jobs.feishu.cn 1](<https://nwd4iy9rd2s.jobs.feishu.cn/campusofSpiritAI/position/detail/7540568709221370150>) |
| 钱大妈 | 半自动（需本人登录） | 0 | 15 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/qdama/6197#/job/25e764b7-c6f5-4ce6-a0f9-e20b104e6d7f/apply>) |
| 钱江摩托 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/geely/147111#/job/4b32c938-2a8d-49e6-9de6-1a7a1352611f/apply>) |
| 乾象投资MetaSummer | 半自动（需本人登录） | 0 | 22 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/metabit-trading/26108#/job/06115752-6b5f-4950-b2b8-680877eeb7c1/apply>) |
| 清原集团-营销类岗位 | 半自动（需本人登录） | 0 | 84 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/kingagroot/56082#/job/00c852e5-1511-4b67-898a-d3aa37f6f171/apply>) |
| 去哪儿旅行 | 半自动（需本人登录） | 0 | 17 | [需登录：hf7l9aiqzx.jobs.feishu.cn 1](<https://hf7l9aiqzx.jobs.feishu.cn/704852/position/detail/7670071337969600819>) |
| 群核科技 | 半自动（需本人登录） | 0 | 56 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/qunhemail/2832#/job/074bef96-d2af-4e8a-941a-b647f3ae3862/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/qunhemail/2833#/job/03d46edc-9bb3-46d9-abad-f456f2cd221a/apply>) |
| 荣耀 | 半自动（需本人登录） | 0 | 174 | [需登录：career.honor.com 1](<https://career.honor.com/SU5ff669649b0d78e6f4296c9a/pb/posDetail.html?postId=6422bd5b2f9d246c37d04ec7&postType=society>) |
| 瑞泰信息 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/rektec/68106#/job/378b25d3-4f9c-49d4-856c-242b7cdcae00/apply>) |
| 睿励 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ruili/43376#/job/0f3dfba6-aad6-40ae-809a-f903094b1815/apply>) |
| 睿能科技 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/raynen/115955#/job/19f74dea-047b-40db-8ece-0ce211127c5c/apply>) |
| 三福 | 半自动（需本人登录） | 0 | 46 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sanfu/46833#/job/025bc2f9-7b83-49ab-942a-625874cea16c/apply>) |
| 三花智控 | 半自动（需本人登录） | 0 | 16 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zjshc/56209#/job/45fc5481-173b-4c78-8b4a-bba221735d61/apply>) |
| 三宁化工 | 半自动（需本人登录） | 0 | 14 | [需登录：ealklohoih0.jobs.feishu.cn 1](<https://ealklohoih0.jobs.feishu.cn/668247/position/detail/7338593198380026138>) |
| 三七互娱 | 半自动（需本人登录） | 0 | 24 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/37/58016#/job/0d95e979-d76c-410d-a880-746843453996/apply>) |
| 森马服饰 | 半自动（需本人登录） | 0 | 35 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/senma/142913#/job/038730fd-8134-406f-ac80-489eea4c1d57/apply>) |
| 森松生命科技 | 半自动（需本人登录） | 0 | 22 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/morimatsu/40041#/job/0363e273-c0ae-498c-99a0-62a1c57684f3/apply>) |
| 杉川集团 | 半自动（需本人登录） | 0 | 71 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/3irobotics/147137#/job/00ab1325-6ba3-4cae-8de1-108a974da67f/apply>) |
| 杉数科技 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shanshu/57987#/job/610ab824-4872-4f92-803e-af23d2968158/apply>) |
| 上海光通信 | 半自动（需本人登录） | 0 | 44 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/gtx/102188#/job/072e7e9f-b9ae-46bd-b19c-7d0c85199aa4/apply>) |
| 上海医药 | 半自动（需本人登录） | 0 | 36 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sphchina/37653#/job/0663693d-2ad5-4f8c-b9c3-aeaa71b69d27/apply>) |
| 上汽销售 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/anji/151248#/job/ee22e6b7-a762-4d56-b51f-7379191fe6ed/apply>) |
| 上药控股 | 半自动（需本人登录） | 0 | 36 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sphchina/39826#/job/0781d36d-f529-4ec7-84b5-f561c9a45bce/apply>) |
| 韶音科技 | 半自动（需本人登录） | 0 | 74 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/aftershokzhr/36940#/job/056a2d6a-dca7-45ed-84af-604beeffd5aa/apply>) |
| 申万宏源集团及证券 | 半自动（需本人登录） | 0 | 214 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/swhysc-job/140752#/job/034c90ba-6988-4bed-9602-a1bc3d0c37a3/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/swhysc-job/166086#/job/0735d21e-5c88-44dc-96d0-260fea0cca6c/apply>) |
| 深信服 | 半自动（需本人登录） | 0 | 27 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sangfor/27944#/job/09c3ab36-c514-4d59-87af-9f20db53593a/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/sangfor/6146#/job/246f1cc4-4395-4b11-88cf-37d5fa1fda32/apply>) |
| 深圳和而泰智能控制 | 半自动（需本人登录） | 0 | 39 | [需登录：salcje7shg.jobs.feishu.cn 1](<https://salcje7shg.jobs.feishu.cn/index/position/detail/7126422595377072415>) |
| 深圳市宝安区甲艺彩美甲美睫店 | 半自动（需本人登录） | 0 | 1 | [需登录：sz.597.com 1](<https://sz.597.com/job-9903ec5810872.html>) |
| 深圳市鑫信腾科技股份 | 半自动（需本人登录） | 0 | 24 | [需登录：itc-auto.jobs.feishu.cn 1](<https://itc-auto.jobs.feishu.cn/909422/position/detail/7553868817308895526>) |
| 神州泰岳 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ultrapower/43036#/job/6c393ed2-802f-4def-bfd2-8a26e55e4260/apply>) |
| 盛合晶微 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sjsemi/144842#/job/0ad72a38-218f-4e7f-bfbb-92749c1953fd/apply>) |
| 盛弘股份 | 半自动（需本人登录） | 0 | 25 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sinexcel/74287#/job/12c7e9d2-6506-44ff-938e-101fb36736e2/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/sinexcel/74286#/job/24b6a050-95f4-48d6-b65f-e297172ef444/apply>) |
| 盛趣游戏 | 半自动（需本人登录） | 0 | 12 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shengqu/96336#/job/097ddf86-39ea-4803-9d5f-69c8523c5c35/apply>) |
| 施乐辉医用产品国际贸易（上海）有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：fimmu.jobsys.cn 1](<https://fimmu.jobsys.cn/index.php/web/index/job-detail?id=113931>) |
| 时代长安 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/catlhr/142020#/job/0c90409f-2b4c-4bf8-9f8a-64724bb97e40/apply>) |
| 世纪前沿 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/centuryfrontier/24842#/job/10283c70-b4f7-427f-a913-f7cc7eea14ad/apply>) |
| 世强硬创 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sekorm/4786#/job/b70f4e6b-26a1-4fa4-b27f-ab824151f7b1/apply>) |
| 首旅如家 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/homeinns/46079#/job/aeae1b29-197c-4014-b559-8a7dd14ff0c2/apply>) |
| 水星家纺 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shuixing/68039#/job/035b3a29-9652-4025-b30e-57f4c68fc229/apply>) |
| 水羊股份 | 半自动（需本人登录） | 0 | 40 | [需登录：syounggroup.jobs.feishu.cn 1](<https://syounggroup.jobs.feishu.cn/campus/position/detail/7323031898392267019>) |
| 顺络电子补录 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/sunlord/172153#/job/6118fd32-cb84-4fce-bbc0-0a9e1ece8d4b/apply>) |
| 舜宇集团 | 半自动（需本人登录） | 0 | 98 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sunnyoptical/45602#/job/01c31535-4908-4084-a720-f177eab420c9/apply>) |
| 思摩尔国际 | 半自动（需本人登录） | 0 | 45 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/smoore/150918#/job/1e9cc137-47ec-43fb-92e8-980cc9cbc634/apply>) |
| 思谋科技 | 半自动（需本人登录） | 0 | 16 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/smartmore/40506#/job/05034f56-f79b-471a-bc53-609701d88b81/apply>) |
| 思瑞浦 | 半自动（需本人登录） | 0 | 23 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/3peakic/67894#/job/097c728f-3ba9-4749-a8c3-75b3c6897ff9/apply>) |
| 思特威 | 半自动（需本人登录） | 0 | 78 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/smartsenstech1/56088#/job/0da23f56-fcb9-492c-a249-8928f7a19f62/apply>) |
| 思勰投资 | 半自动（需本人登录） | 0 | 18 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/sixiecapital/42909#/job/038e45f8-95f5-46e9-92e9-51194dce8fa8/apply>) |
| 斯达半导 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/powersemi/101981#/job/1741af43-d622-4b95-9216-e16e38649876/apply>) |
| 四川腾盾科创 | 半自动（需本人登录） | 0 | 26 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tengden/140997#/job/00c6ea25-22ac-4452-a249-cce1c73bc894/apply>) |
| 松灵机器人 | 半自动（需本人登录） | 0 | 7 | [需登录：mammotion.jobs.feishu.cn 1](<https://mammotion.jobs.feishu.cn/AgileX_campus_recruitment/position/detail/7613604274543921451>) |
| 松下集团 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/panasonic/41989#/job/16acbf5d-f23a-4613-b4b4-5d8c0f25cde0/apply>) |
| 搜狐 | 半自动（需本人登录） | 0 | 35 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sohu/28313#/job/006a12bc-2a1c-4ba6-a8be-8557243ab788/apply>) |
| 搜狐畅游 | 半自动（需本人登录） | 0 | 40 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cyou-inc/42233#/job/10cff644-7f9d-47dd-a3ab-9058c118157d/apply>) |
| 搜狐集团 | 半自动（需本人登录） | 0 | 13 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sohu/5682#/job/22d24d5f-c86e-4154-af16-dfa2ffd8034c/apply>) |
| 苏交科集团 | 半自动（需本人登录） | 0 | 12 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jsti/144121#/job/24ceed47-4754-426e-92ab-999feb7ab5f9/apply>) |
| 苏商银行 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/snb/45592#/job/229b76b2-d7c8-4595-8610-c733f8fe4257/apply>) |
| 燧石投资 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/causis/168135#/job/341e3363-df0e-417a-ba4d-31afbc5eeb3b/apply>) |
| 燧原科技 | 半自动（需本人登录） | 0 | 48 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/enflame/168420#/job/08ffed47-2371-40b2-bb3f-49ffa697ce04/apply>) |
| 塔斯汀 | 半自动（需本人登录） | 0 | 1 | [需登录：517tastien.jobs.feishu.cn 1](<https://517tastien.jobs.feishu.cn/071459/position/detail/7660479363133933875>) |
| 拓维信息 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/talkweb/71921#/job/03bada41-54a1-4c33-a8c9-ad9e6dc52528/apply>) |
| 太极股份 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/taiji/43573#/job/4cc823f6-2ccb-4486-94dd-c3e9767d8ef0/apply>) |
| 太平洋产险安徽分公司 | 半自动（需本人登录） | 0 | 19 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cpicproperty/150956#/job/291ea538-a191-423d-ac0f-d89fdea06591/apply>) |
| 特斯拉T-STAR | 半自动（需本人登录） | 0 | 280 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tesla/41460#/job/00384c74-833a-4229-946e-fc2f8d96522e/apply>) |
| 腾盾科创 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tengden/142799#/job/3aaa6ff7-f1b5-4788-8766-716f17f37f52/apply>) |
| 腾讯 | 半自动（需本人登录） | 0 | 1241 | [需登录：careers.tencent.com 1](<https://careers.tencent.com/jobdesc.html?postId=1554352375597113344>) · [需登录：tencent.wd1.myworkdayjobs.com 2](<https://tencent.wd1.myworkdayjobs.com/Tencent_Careers/job/China-Shenzhen/--_R107219>) |
| 天府永兴实验室 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tfyxlab/96036#/job/1eb255cf-98b8-41b4-a61c-50a52220c2c9/apply>) |
| 天弘基金 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/thfund/46219#/job/173e0536-3544-47c4-b663-293b6970f2ea/apply>) |
| 天虹数科 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tianhongshuke/24998#/job/28cde612-1a23-4b20-a12b-f92f39d67c83/apply>) |
| 天演资本 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tianyancapital/98902#/job/31d33567-2ba9-49dd-8bd5-0fb949ccd853/apply>) |
| 铁四院（湖北）工程监理咨询有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：www.jianlihr.com 1](<https://www.jianlihr.com/job/347491.html>) |
| 图拉斯 | 半自动（需本人登录） | 0 | 11 | [需登录：lanhevip.jobs.feishu.cn 1](<https://lanhevip.jobs.feishu.cn/201093/position/detail/7603252963113027881>) |
| 涂鸦智能-补录 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tuya/147434#/job/056072f4-b656-44ad-974f-537d4b68c6dc/apply>) |
| 途虎养车 | 半自动（需本人登录） | 0 | 22 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tuhu/28398#/job/0a61be95-4cf0-4c76-b54c-3d3fffe65d9c/apply>) |
| 途游游戏-创意训练营 | 半自动（需本人登录） | 0 | 65 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tuyoogame/71965#/job/032e4fab-7a80-450e-9193-b5a05ae347b8/apply>) |
| 完美世界 | 半自动（需本人登录） | 0 | 38 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/pwrd/150080#/job/0e71281c-1e1f-45d5-8a33-89042e0b4993/apply>) |
| 万物云 | 半自动（需本人登录） | 0 | 74 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/vanke/147055#/job/01ff429b-b910-4f57-9c9c-a6ea43c124a9/apply>) |
| 望尘科技 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/galasports/98034#/job/0a1c985f-edd0-4054-9d0a-a7acd10f37ff/apply>) |
| 微步在线 | 半自动（需本人登录） | 0 | 32 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/threatbook/39679#/job/025f23c4-65b9-41c5-82a4-3c7419e6a44f/apply>) |
| 微创脑科学 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/microport/45939#/job/ae06fe9d-1e30-4550-ad0c-6a6658bc8428/apply>) |
| 微观博易 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/11d9210f-29d7-4751-9814-ac75ac006c99/apply>) |
| 微派无限 | 半自动（需本人登录） | 0 | 22 | [需登录：wepie.jobs.feishu.cn 1](<https://wepie.jobs.feishu.cn/359597/position/detail/7319436946072373543>) |
| 微源半导体 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/lowpowersemi/168412#/job/00d7f0db-af52-4cd3-931e-83b7dbfe3395/apply>) |
| 唯捷创芯 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/vanchip/47239#/job/0fcea951-21cf-42a4-8c4d-6a65a3a11205/apply>) |
| 维谛技术(Vertiv) | 半自动（需本人登录） | 0 | 29 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/vertiv/118713#/job/11d2aada-2087-4820-84ea-cfd546c8e3ff/apply>) |
| 维信诺 | 半自动（需本人登录） | 0 | 38 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/newvisionox/24735#/job/009d0a59-2598-4c25-a352-0a2503b70f31/apply>) |
| 卫龙美味 | 半自动（需本人登录） | 0 | 137 | [需登录：weilongmeiwei.jobs.feishu.cn 1](<https://weilongmeiwei.jobs.feishu.cn/index/position/detail/7644777182644848950>) |
| 为旌科技 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/visinextek/41636#/job/0f3a0d6b-e8f8-4950-a991-3622a05e5dfc/apply>) |
| 未来一手 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/weilaiyishou/145029#/job/08a045f7-2cb5-4577-afbe-e0f7d5c0a83c/apply>) |
| 未岚大陆 | 半自动（需本人登录） | 0 | 34 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/weilandalu/98096#/job/03c4277e-7d7b-4ad9-92ff-a69f6a864896/apply>) |
| 蔚来 | 半自动（需本人登录） | 0 | 1924 | [需登录：nio.jobs.feishu.cn 1](<https://nio.jobs.feishu.cn/campus/position/detail/7670815277970344246>) |
| 温氏股份 | 半自动（需本人登录） | 0 | 83 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/wens/92366#/job/025dd37d-3d97-47cd-a0fc-b7ef1c2356e2/apply>) |
| 文远知行 | 半自动（需本人登录） | 0 | 124 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/jingchi/2137#/job/00238e61-973f-4e18-b60a-4152de125e4b/apply>) |
| 沃德精密 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/world-machining/36560#/job/85b09860-bd5d-46ee-8dd3-1a74e032b7d0/apply>) |
| 无忧传媒-补录 | 半自动（需本人登录） | 0 | 13 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/joymedia/7674#/job/076a9dc0-26f9-4193-96bd-92f4b946340c/apply>) |
| 舞肌科技 | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/wuji/145173#/job/4890d6f9-88a1-4b21-a03b-68c62ff4955e/apply>) |
| 西山居 | 半自动（需本人登录） | 0 | 33 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/xishanju/37430#/job/01b16fb7-80e3-486f-8ad8-e5abf2b8e5cd/apply>) |
| 希望学 | 半自动（需本人登录） | 0 | 28 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/xiwang/146380#/job/0902c2cb-d322-4cf3-b6f8-2db8d62da4a6/apply>) |
| 虾皮Shopee | 半自动（需本人登录） | 0 | 33 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shopee/170008#/job/09fd8a82-e696-48d8-b115-42061b35dc79/apply>) |
| 先声诊断 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/simceredx/74124#/job/03b26ad1-511a-4dc2-b805-18e8ea838e96/apply>) |
| 小鹏集团-营销服 | 半自动（需本人登录） | 0 | 541 | [需登录：xiaopeng.jobs.feishu.cn 1](<https://xiaopeng.jobs.feishu.cn/campus/position/detail/7278601636343728444>) |
| 小鹏汽车 | 半自动（需本人登录） | 0 | 1478 | [需登录：xiaopeng.jobs.feishu.cn 1](<https://xiaopeng.jobs.feishu.cn/index/position/detail/7273119092109871397>) |
| 小赢科技 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/xiaoying/148851#/job/11d4c1e3-b1d8-413b-9349-c94ae6f2c783/apply>) |
| 协鑫能科 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/gclpower/140979#/job/5bf4f951-72fe-4783-a2dd-617a37e030d0/apply>) |
| 芯耀辉科技 | 半自动（需本人登录） | 0 | 15 | [需登录：geg7eg8cyc.jobs.feishu.cn 1](<https://geg7eg8cyc.jobs.feishu.cn/615803/position/detail/7654779576325130522>) |
| 芯源微 | 半自动（需本人登录） | 0 | 26 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/688037/144533#/job/145debbd-4e42-4327-885f-47005b4cead5/apply>) |
| 芯粤能半导体 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ascenpower/166280#/job/3904d077-21c7-4c5a-bf73-fe336a37203f/apply>) |
| 昕原半导体 | 半自动（需本人登录） | 0 | 49 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/innostar1/46008#/job/0af986c2-7e6e-47e8-afe3-3f995da6b2f3/apply>) |
| 欣旺达 | 半自动（需本人登录） | 0 | 232 | [需登录：sunwoda.zhiye.com 1](<https://sunwoda.zhiye.com/campus/detail?jobAdId=59e3243d-de14-44c9-8c68-2bcc487437cb>) |
| 新达盟-珠海万达商管 | 半自动（需本人登录） | 0 | 171 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/wandacm/164049#/job/035a3926-d053-48c0-b0c2-5b8dc067a9fb/apply>) |
| 新国都集团 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/xgd/7850#/job/009405e0-93c4-487d-894f-b8cded951def/apply>) |
| 新华都 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/newonder/146673#/job/30648ce2-b4c7-4931-8417-8e18178328c2/apply>) |
| 新浪&amp;微博 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sina/43536#/job/38f7e584-d2b9-40c1-aea9-59db35147cf3/apply>) |
| 新石器无人车 | 半自动（需本人登录） | 0 | 37 | [需登录：r3c0qt6yjw.jobs.feishu.cn 1](<https://r3c0qt6yjw.jobs.feishu.cn/campus/position/detail/7658242279371901230>) |
| 新中大科技 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/newgrand/151701#/job/0529b337-ef5a-4ec1-a368-198f3a36ccfd/apply>) |
| 信得科技 | 半自动（需本人登录） | 0 | 16 | [需登录：sinder-tech.jobs.feishu.cn 1](<https://sinder-tech.jobs.feishu.cn/1999/position/detail/7277393215069882636>) |
| 信锐技术-先锋计划 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sangfor/37521#/job/ba27ab8a-85d3-4d32-9900-7b6fcb37cdd3/apply>) |
| 信雅达 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sunyard/43203#/job/5044cf48-6321-4d50-ba35-14380780b9c8/apply>) |
| 星环聚能 | 半自动（需本人登录） | 0 | 31 | [需登录：startorus.jobs.feishu.cn 1](<https://startorus.jobs.feishu.cn/419527/position/detail/7544942708503284007>) |
| 星环科技 | 半自动（需本人登录） | 0 | 30 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/transwarp/3196#/job/0ebacbd8-adea-4f35-bbd6-f3d0bb325a6c/apply>) |
| 星辉游戏 | 半自动（需本人登录） | 0 | 48 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/rastar/96229#/job/00c4de97-8f4e-4d9c-abda-3d187cdd6a02/apply>) · [需登录：rastargame.jobs.feishu.cn 2](<https://rastargame.jobs.feishu.cn/066491/position/detail/7623230527679990025>) |
| 星猿哲科技 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/xyzrobotics/26847#/job/3828a13e-3682-4849-b852-0eb9de10e436/apply>) |
| 行芯科技 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/phlexing/100123#/job/1e41e811-07c6-46b8-b98a-372f4141c2db/apply>) |
| 兄弟科技 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/brother/150715#/job/2286d501-7eea-4e3a-be56-f9476543c776/apply>) |
| 雄鹰轮胎 | 半自动（需本人登录） | 0 | 7 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/wzgroup/76099#/job/286815f3-4ed2-4bd2-8b9d-5e80f2cce0f7/apply>) |
| 徐福记-技术管培生(工程方向) | 半自动（需本人登录） | 0 | 5 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hfc-foods/102201#/job/07da3350-5723-4696-8fa6-4baede008d8d/apply>) |
| 学而思 | 半自动（需本人登录） | 0 | 635 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tal/146099#/job/0011f09c-7680-4c02-8367-2dab549429c2/apply>) |
| 学而思-研后补录 | 半自动（需本人登录） | 0 | 18 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tal/148080#/job/01a7363e-10b4-4cac-8f52-715f2b17b8a2/apply>) |
| 迅雷X-PEP产品星计划 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/xunlei/26600#/job/02d9c5c3-dd1f-460d-87ea-6d80a3e2feed/apply>) |
| 雅迪集团 | 半自动（需本人登录） | 0 | 42 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/yadea/144891#/job/3096a291-0771-4fff-a181-cd591aacc802/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/yadea/26984#/job/04b5e870-3a29-499b-87fb-ed4d6c30a08c/apply>) |
| 雅迪科技集团 | 半自动（需本人登录） | 0 | 92 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yadea/26985#/job/048ecaf1-2cad-4588-abcb-e8778d7546e1/apply>) |
| 延锋 | 半自动（需本人登录） | 0 | 120 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yanfeng/45086#/job/00755564-8550-4a3c-8620-1f27288dca65/apply>) |
| 炎魂网络 | 半自动（需本人登录） | 0 | 16 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yanhun/24017#/job/096f3178-054c-4b9b-9fae-514fbfb2590b/apply>) |
| 阳光电源 | 半自动（需本人登录） | 0 | 169 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sungrow/94416#/job/00b2221a-d4a9-4b74-a87c-c8a562952c2c/apply>) |
| 伊戈尔电气 | 半自动（需本人登录） | 0 | 43 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ygr/44618#/job/09178045-2c43-4619-801f-3f8ec736e365/apply>) |
| 易控智驾 | 半自动（需本人登录） | 0 | 18 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/eqhr/39786#/job/0c7cefa7-3441-4510-8a33-c0786145fe15/apply>) |
| 绎立锐光 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ylxinc/140730#/job/44f98596-ef35-4068-97f9-b730a81a7deb/apply>) |
| 因诺资产 | 半自动（需本人登录） | 0 | 13 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/innoam/142310#/job/25ebfe82-5229-493a-a68e-e52d1fe565bf/apply>) |
| 银河通用机器人 | 半自动（需本人登录） | 0 | 55 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yinhetongyong/165930#/job/003e0d32-8b9a-490c-98fe-12cf0be3960f/apply>) |
| 银轮股份 | 半自动（需本人登录） | 0 | 20 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yinlun/128571#/job/2b22ac47-29e6-4fa5-905e-41d6fe3c628b/apply>) |
| 引力传媒 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yinli/148676#/job/0cf63e8a-0384-4c41-ba40-9825b56c9190/apply>) |
| 英科医疗 | 半自动（需本人登录） | 0 | 164 | [需登录：global-intco.jobs.feishu.cn 1](<https://global-intco.jobs.feishu.cn/840753/position/detail/7362413703092341018>) |
| 鹰角网络 | 半自动（需本人登录） | 0 | 104 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hypergryph/26326#/job/032cb5be-c2ce-4595-940a-97d50e7fe617/apply>) |
| 影石 Insta360 | 半自动（需本人登录） | 0 | 606 | [需登录：arashivision.jobs.feishu.cn 1](<https://arashivision.jobs.feishu.cn/campus/position/detail/7497960654378125631>) |
| 永卓控股 | 半自动（需本人登录） | 0 | 47 | [需登录：everrising.jobs.feishu.cn 1](<https://everrising.jobs.feishu.cn/graduate/position/detail/7637343675513145643>) |
| 甬兴证券 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yongxingsec/27127#/job/04a83b5a-30af-4c9b-832d-481292595f9b/apply>) |
| 游卡 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yokagames/41940#/job/55703faa-fcc7-4def-893e-87006fb9567d/apply>) |
| 有道领世 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/lingshi/144566#/job/3615870a-0c11-457f-a309-e1310398f7a9/apply>) |
| 佑驾创新第二波岗位 | 半自动（需本人登录） | 0 | 31 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/minieye/118571#/job/1c960618-073e-4bf4-88c9-fda4817b2410/apply>) |
| 宇石空间 | 半自动（需本人登录） | 0 | 24 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/astronstone/168327#/job/120cfb1e-f630-4239-ac14-f47ce1804894/apply>) |
| 玉柴集团 | 半自动（需本人登录） | 0 | 133 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yuchai/140075#/job/01e9ae14-ca1d-4cc1-bb7b-ee014295be61/apply>) |
| 驭势科技 | 半自动（需本人登录） | 0 | 69 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yushi/3773#/job/026f030d-259d-4caa-bd0a-af0b2c771e40/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/yushi/3774#/job/014e65ff-ee6f-4c91-8d80-8c8abb7561d1/apply>) |
| 御微半导体 | 半自动（需本人登录） | 0 | 50 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yuweitk/146788#/job/04bb5659-1fae-46cc-8ac5-fe8a37af988c/apply>) |
| 元戎启行 | 半自动（需本人登录） | 0 | 14 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/deeproute/145894#/job/05d60257-f3e5-40f5-be9c-4e7f780c22ff/apply>) |
| 原力灵机 | 半自动（需本人登录） | 0 | 38 | [需登录：dexmal-inc.jobs.feishu.cn 1](<https://dexmal-inc.jobs.feishu.cn/285572/position/detail/7572102804824082726>) |
| 猿辅导集团 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fenbi/47742#/job/33f21126-c588-41b6-a703-24932d58abbb/apply>) |
| 远景动力 | 半自动（需本人登录） | 0 | 307 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/envisiongroup/43123#/job/00a6c40a-6c9c-47b6-acb9-115f955a0b4f/apply>) |
| 月之暗面 | 半自动（需本人登录） | 0 | 46 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/moonshot/148507#/job/08b3139e-40da-442b-b5a2-e5477055ead3/apply>) |
| 越疆 | 半自动（需本人登录） | 0 | 109 | [需登录：dobot.zhiye.com 1](<https://dobot.zhiye.com/campus/detail?jobAdId=024df781-6f1e-49f8-9a05-9264aaac0d54>) |
| 云和恩墨-销售实习生专项 | 半自动（需本人登录） | 0 | 26 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/enmotech/47098#/job/0124a088-c122-4bf4-b92e-d679323ca844/apply>) |
| 增芯科技 | 半自动（需本人登录） | 0 | 23 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zensemi/142586#/job/0a71fe88-13ea-4546-ba0a-baecf0375610/apply>) |
| 长亭科技 | 半自动（需本人登录） | 0 | 20 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/chaitin/92701#/job/0aeca3c8-c085-403b-b0a0-031424261335/apply>) |
| 招银云创 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/mbcloud/150116#/job/652e9057-ee11-4027-9208-b09c37e3759f/apply>) |
| 昭关照明WELLMAX | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/wellmax/146179#/job/25ab11c8-4138-49ca-9c14-d942e0e4c93c/apply>) |
| 兆易创新 | 半自动（需本人登录） | 0 | 47 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/gigadevice/92215#/job/0e962010-ee81-484a-8ea5-3c5feb43eb40/apply>) |
| 浙江医药 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zmc/74121#/job/1b8595a9-300a-4562-93d9-22d2d469cc41/apply>) |
| 真格基金 | 半自动（需本人登录） | 0 | 11 | [需登录：zhenfund.jobs.feishu.cn 1](<https://zhenfund.jobs.feishu.cn/356542/position/detail/7423676971027499305>) |
| 真格基金被投企业 | 半自动（需本人登录） | 0 | 165 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/zhenfund/144989#/job/00b572b1-f5ce-44b5-bbb4-bfd459036ec3/apply>) |
| 正定私募 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zding/117879#/job/2f9d0b02-0682-4572-a93f-e1228a415c95/apply>) |
| 正泰集团新增岗位 | 半自动（需本人登录） | 0 | 33 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/chint/40745#/job/01a82fde-b861-4951-9ab4-7e20eaa95606/apply>) |
| 郑州堃垚企业管理咨询有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：www.goworkla.cn 1](<https://www.goworkla.cn/Position/PositionDetail?positionid=69c5ddb81a187ffac185694b>) |
| 知存科技 | 半自动（需本人登录） | 0 | 19 | [需登录：iucylxooqp.jobs.feishu.cn 1](<https://iucylxooqp.jobs.feishu.cn/200839/position/detail/7481542259663538458>) |
| 知乎 | 半自动（需本人登录） | 0 | 32 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zhihu/68321#/job/036db2e3-327e-466d-ab40-50d03e4e8275/apply>) |
| 挚文集团 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/immomo/54299#/job/0832dde0-f632-4de2-8fed-5c9875d8ac55/apply>) |
| 致欧家居 | 半自动（需本人登录） | 0 | 19 | [需登录：songmicshome.jobs.feishu.cn 1](<https://songmicshome.jobs.feishu.cn/852372/position/detail/7672650855288686884>) |
| 智驾大陆(上海)智能科技有限公司 | 半自动（需本人登录） | 0 | 1 | [需登录：www.haolietou.com 1](<https://www.haolietou.com/j_334681>) |
| 智谱 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zphz/148984#/job/124aa3c6-e4a8-4e7d-a63b-ec8b915611a8/apply>) |
| 智源研究院 | 半自动（需本人登录） | 0 | 17 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/baai/42174#/job/087b1f30-a45d-4e65-95ef-3902267c6a09/apply>) |
| 中国电信人工智能研究院 | 半自动（需本人登录） | 0 | 93 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/chinatelecomai/144822#/job/00dac747-7a7c-4aeb-b1cc-5c05f97ea8f0/apply>) |
| 中国电子迈普通信 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/maipu/45544#/job/7b5c9134-6ae7-4f7f-8c76-8d8322bef0a6/apply>) |
| 中国东信 | 半自动（需本人登录） | 0 | 15 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/caih/6773#/job/0704f856-c1d4-4a33-966a-a4da980a4cfb/apply>) |
| 中国葛洲坝集团机电建设有限公司 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cggc/145102#/job/2861b02f-24a7-4a38-b4e0-d84d750cafdb/apply>) |
| 中国海诚工程科技股份有限公司 | 半自动（需本人登录） | 0 | 33 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/haisum/78146#/job/03b8dc3f-d9dd-4458-a05f-4d1b3a8e8622/apply>) |
| 中国航空工业发展研究中心 | 半自动（需本人登录） | 0 | 20 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/hkgyxxzx/148787#/job/199a68dc-50bc-4233-a020-ab9a7bae2aaf/apply>) |
| 中国联塑集团 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/lesso/70303#/job/0d55264c-7618-4210-96fc-cd8a55f81db6/apply>) |
| 中国铁建大桥局 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cr13g/143005#/job/3b3da2d3-d243-4aeb-b248-fd95c8f83ebf/apply>) |
| 中航证券 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/avicsec/56251#/job/8950ffa9-4023-4177-82e9-558ccca46e61/apply>) |
| 中控技术 | 半自动（需本人登录） | 0 | 10 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/supcon/148189#/job/2b8c9b57-f86b-4cdb-a29e-2752bd239da5/apply>) |
| 中控信息 | 半自动（需本人登录） | 0 | 3 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zkxx/72098#/job/27e4a6c6-dced-4ecb-99d1-bad62dd6fec8/apply>) |
| 中手游 | 半自动（需本人登录） | 0 | 1 | [需登录：vop2mwhhcp.jobs.feishu.cn 1](<https://vop2mwhhcp.jobs.feishu.cn/index/position/detail/7447365454094731530>) |
| 中顺洁柔 | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zsjr/141128#/job/3788df33-238f-446f-8619-f685ada2f7cf/apply>) |
| 中微公司 | 半自动（需本人登录） | 0 | 171 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/amec/146254#/job/87ee109f-1d00-4e6e-86b1-2316ec9f0618/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/amec/4362#/job/00002035-6aa5-4049-8601-d0099f6987ee/apply>) |
| 中兴通讯 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/ztehr4/150449#/job/0cd95c1e-8620-4aea-90b4-8c96f7bd062d/apply>) |
| 中兴通讯供应链 | 半自动（需本人登录） | 0 | 95 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zte/46903#/job/08b5d180-ce7b-4e2c-81e5-2f1c9b48f34d/apply>) |
| 中兴微电子 | 半自动（需本人登录） | 0 | 106 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/sanechips/102705#/job/0108023b-0236-45be-b7ea-7bd8bbf026a9/apply>) |
| 中邮消费金融 | 半自动（需本人登录） | 0 | 11 | [需登录：is35svcbne.jobs.feishu.cn 1](<https://is35svcbne.jobs.feishu.cn/youcash/position/detail/7411068198127421746>) |
| 众安 | 半自动（需本人登录） | 0 | 19 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zhongan/148589#/job/0458d820-2b0b-484b-9c03-84d013b7568d/apply>) |
| 众擎机器 | 半自动（需本人登录） | 0 | 20 | [需登录：dx3a2bminsq.jobs.feishu.cn 1](<https://dx3a2bminsq.jobs.feishu.cn/934647/position/detail/7533527313411000615>) |
| 洲明科技 | 半自动（需本人登录） | 0 | 18 | [需登录：unilumin.zhiye.com 1](<https://unilumin.zhiye.com/campus/detail?jobAdId=058f3f83-7c78-4b5a-a352-17f1477dd250>) |
| 主线科技 | 半自动（需本人登录） | 0 | 18 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/trunk/39504#/job/12a66eca-0a43-4392-b76a-6c524159a8b4/apply>) |
| 卓识基金 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zsquant/36544#/job/b89b4c8b-0141-424a-9c93-e2544d2a909e/apply>) |
| 卓望公司 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/aspire/100261#/job/0464f01f-c536-4f97-9dac-f6a3fc3b7266/apply>) |
| 啄木鸟医疗 | 半自动（需本人登录） | 0 | 27 | [需登录：z1zgmci7a8s.jobs.feishu.cn 1](<https://z1zgmci7a8s.jobs.feishu.cn/900011/position/detail/7262186102986344765>) |
| 紫龙游戏 | 半自动（需本人登录） | 0 | 2 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zlongame-recruit/24766#/job/6434eaae-5816-4663-8e62-ffae80f4690d/apply>) |
| 自变量机器人 | 半自动（需本人登录） | 0 | 77 | [需登录：x2-robot.jobs.feishu.cn 1](<https://x2-robot.jobs.feishu.cn/912130/position/detail/7527569321943746855>) |
| 作业帮 | 半自动（需本人登录） | 0 | 34 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/0eca73f4-28d2-41c2-9438-266d16240d7e/apply>) |
| Alpha灵均投资 | 半自动（需本人登录） | 0 | 24 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/lingjuninvest/46355#/job/24d35ea9-6d18-4cfb-a843-7045a80cd7ae/apply>) |
| BIGO-技术专场 | 半自动（需本人登录） | 0 | 35 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/bigo/1018#/job/134e9b12-c279-498f-809a-f259674f2f11/apply>) |
| BlackRock China Fund Management Company | 自动（免登录） | 1 | 0 | [免登录：careers.blackrock.com 1](<https://careers.blackrock.com/job/shanghai/analyst-quantitative-researcher/45831/94327989472>) |
| Cadence | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/cadence/118728#/job/0caa1ffd-4051-4edb-b326-034b19a1c317/apply>) |
| CTI华测检测 | 半自动（需本人登录） | 0 | 136 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/cti/142093#/job/0029f615-19c2-4298-b39c-aeaa0dc474bf/apply>) |
| Cubist Systematic Strategies（Point72 旗下） | 半自动（需本人登录） | 0 | 1 | [需登录：careers.point72.com 1](<https://careers.point72.com/CSJobDetail?jobCode=CSS-0012688&jobName=quantitative-researcher&locale=English&location=Hong+Kong&retURL=%2FCSCareerSearch>) |
| Deeyeo德佑之家 | 半自动（需本人登录） | 0 | 13 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/yxws/168223#/job/26cde826-37f3-46d0-8089-47a861a4b603/apply>) |
| DolphinDB智臾科技 | 半自动（需本人登录） | 0 | 8 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/dolphindb/101962#/job/536c5815-9893-4192-9e43-98c732121f33/apply>) |
| Fastlane | 半自动（需本人登录） | 0 | 13 | [需登录：fastbase.jobs.feishu.cn 1](<https://fastbase.jobs.feishu.cn/588906/position/detail/7566854873620039987>) |
| FESCO | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/fesco/98614#/job/6338c862-9a5b-4c06-815a-4a8f3478a186/apply>) |
| FunPlus | 半自动（需本人登录） | 0 | 65 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/funplus01/147931#/job/0082e46f-2205-4e40-9b39-520cdecb6748/apply>) |
| Garena | 半自动（需本人登录） | 0 | 27 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/garena/148076#/job/07a06c99-fe16-43f9-8b76-f9c8357664b6/apply>) |
| GE医疗 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/gehc/142250#/job/525e55e0-8003-422f-9f72-8adf43335ada/apply>) |
| Meshy | 半自动（需本人登录） | 0 | 20 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/social-recruitment/taichi/148086#/job/035e6ff3-8b17-4cf9-80da-b731ee51fafd/apply>) |
| MetaApp | 半自动（需本人登录） | 0 | 49 | [需登录：meta.jobs.feishu.cn 1](<https://meta.jobs.feishu.cn/140297/position/detail/7449578575760689458>) |
| Nothing | 半自动（需本人登录） | 0 | 43 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/nothing#/job/087d3fff-0d42-4b03-a0d8-8c9d0e4980ca/apply>) |
| NVIDIA | 半自动（需本人登录） | 0 | 30 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/nvidia/47111#/job/00ee1e04-41e7-4342-b934-0d386f936620/apply>) |
| OCS灿瑞科技 | 半自动（需本人登录） | 0 | 9 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/canrui/42687#/job/365a9a59-d7a3-4102-85a9-b44e8ff22ca8/apply>) |
| QUADRANT | 半自动（需本人登录） | 0 | 12 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/quadrant/141032#/job/1f12385e-b743-4e07-b5e8-fed1dcc6c9c5/apply>) |
| RoboSense | 半自动（需本人登录） | 0 | 94 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/robosense/69887#/job/00650c41-b116-4dd2-89df-00b65dabb62e/apply>) |
| RoboSense【天才罗伯特】 | 半自动（需本人登录） | 0 | 4 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/robosense/141961#/job/11278e04-4a1b-4169-8ed8-13334994e6b2/apply>) |
| SHEIN-仓储管理储备干部 | 半自动（需本人登录） | 0 | 61 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shein/2932#/job/053dc43c-9f5a-4a78-8147-090b95527fd3/apply>) |
| Shopee | 半自动（需本人登录） | 0 | 77 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shopee/140513#/job/0691f675-17d7-4f6f-8594-1b455483979e/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/campus-recruitment/shopee/2962#/job/04f4b340-ff59-4457-bdf1-38916610c96c/apply>) |
| Shopee-Sea全球管理培训生计划 | 半自动（需本人登录） | 0 | 1 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shopee/150780#/job/2f46feb3-4236-43ba-9138-d379b4197143/apply>) |
| Shopee跨境团队 | 半自动（需本人登录） | 0 | 11 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/shopee/144343#/job/115f29cf-d989-4c09-8080-b5a5425709c7/apply>) |
| SHOPLAZZA | 半自动（需本人登录） | 0 | 5 | [需登录：shoplazza.jobs.feishu.cn 1](<https://shoplazza.jobs.feishu.cn/863295/position/detail/7618798898949212458>) |
| Style3D | 半自动（需本人登录） | 0 | 33 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/linctex/41697#/job/182cdfca-b8bd-4683-b7f7-23e3012508f1/apply>) · [需登录：app.mokahr.com 2](<https://app.mokahr.com/social-recruitment/linctex/46055#/job/00681bd9-2723-4513-8d2a-0dd23a7ab8d1/apply>) |
| tap4fun | 半自动（需本人登录） | 0 | 6 | [需登录：app.mokahr.com 1](<https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/1d86577b-b561-4bc7-b5dc-e9a8af8d6345/apply>) |
| xTool | 半自动（需本人登录） | 0 | 122 | [需登录：xtool.jobs.feishu.cn 1](<https://xtool.jobs.feishu.cn/index/position/detail/7078249471854790945>) |
