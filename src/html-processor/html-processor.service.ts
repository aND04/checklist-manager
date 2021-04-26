import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { DomHandler, Parser } from 'htmlparser2';
import {
  existsOne,
  findAll,
  findOne,
  getChildren,
  getElementsByTagName,
  getText,
} from 'domutils';
import { Node } from 'domhandler';
import { ECheckboxReply, EItemType, EReportType } from './util/html-types.enum';
import {
  CheckboxItemModel,
  ImageModel,
  ResourceModel,
} from '../checklist/schemas/form.model';
import { ChecklistBuilder } from '../checklist/builder/checklist.builder';
import { CheckboxItemModelBuilder } from '../checklist/builder/checkbox-item.builder';

@Injectable()
export class HtmlProcessorService {
  private readonly logger = new Logger(HtmlProcessorService.name);
  private readonly fileContent: string;
  private readonly domHandler: DomHandler;
  private readonly checklistBuilder: ChecklistBuilder;

  constructor() {
    this.fileContent = readFileSync(
      __dirname + '/../data/report.html',
      'utf-8',
    );
    this.domHandler = new DomHandler((error, dom) => {
      if (error) {
        this.logger.error(error.message);
        throw Error(error.message);
      } else {
        this.computeList(dom);
      }
    });
    this.checklistBuilder = new ChecklistBuilder();
  }

  test(): any {
    const parser = new Parser(this.domHandler);
    parser.write(this.fileContent);
    parser.end();
    return this.checklistBuilder.build();
  }

  private containsId(elementId: string, currentId: string): boolean {
    return !!elementId && elementId.includes(currentId);
  }

  private computeList(dom: Node[]): void {
    let sectionCount = 1;
    let itemCount = 1;
    let id = this.updateId(sectionCount, itemCount);
    const reportType = getText(
      findOne((el) => el.name === 'title', dom),
    ) as EReportType;
    this.checklistBuilder.withType(reportType);
    const checkboxItems = new Array<CheckboxItemModel>();
    while (existsOne((el) => this.containsId(el.attribs.id, id), dom)) {
      let stillHasItems = true;
      while (stillHasItems) {
        id = this.updateId(sectionCount, itemCount);
        const items = findAll((el) => this.containsId(el.attribs.id, id), dom);
        if (items.length > 0) {
          this.logger.log(`Parsing content for item with id: ${id}`);
          const checkboxItemBuilder = new CheckboxItemModelBuilder();
          checkboxItemBuilder.withIdentifier(id);
          items.forEach((item) => {
            this.parseItem(item, checkboxItemBuilder);
          });
          checkboxItems.push(checkboxItemBuilder.build());
          itemCount++;
        } else {
          itemCount = 1;
          stillHasItems = false;
        }
      }
      sectionCount++;
      id = this.updateId(sectionCount, itemCount);
    }
    this.checklistBuilder.withItems(checkboxItems);
  }

  private updateId(sectionCount: number, itemCount: number): string {
    return sectionCount + '.' + itemCount;
  }

  private parseItem(
    node: Node,
    checkboxItemBuilder: CheckboxItemModelBuilder,
  ): void {
    const content = getText(node);
    const splitContent = content.split(':');
    const itemType = splitContent[0];
    const itemContent = splitContent[1];
    switch (itemType) {
      case EItemType.CHECKBOX:
        checkboxItemBuilder.withCheckbox(itemContent.trim() as ECheckboxReply);
        break;
      case EItemType.NOTES:
        checkboxItemBuilder.withNote(
          itemContent.includes('Este campo ainda não foi preenchido')
            ? ''
            : itemContent,
        );
        break;
      case EItemType.RESOURCES:
        this.handleInternetResourcesReply(node, checkboxItemBuilder);
        break;
      case EItemType.IMAGES:
        this.handleImagesReply(node, checkboxItemBuilder);
        break;
      default:
        this.logger.error('Unknown item type');
        throw Error('Unknown item type');
    }
  }

  private handleInternetResourcesReply(
    node: Node,
    checkboxItemBuilder: CheckboxItemModelBuilder,
  ) {
    const resources = new Array<ResourceModel>();
    if (getText(node).endsWith('Recursos da Internet: ')) {
      // TODO - html has some random blank nodes that need to be removed (.nextSibling.nextSibling === workaround)
      const children = getChildren(node.nextSibling.nextSibling);
      findAll((el) => el.name === 'a', children).forEach((value) => {
        const href = value.attribs.href;
        resources.push(new ResourceModel(href, href));
      });
    }
    checkboxItemBuilder.withResources(resources);
  }

  private handleImagesReply(
    node: Node,
    checkboxItemBuilder: CheckboxItemModelBuilder,
  ) {
    const images = new Array<ImageModel>();
    if (getText(node).endsWith('Imagens Uploaded: ')) {
      getElementsByTagName('img', node.parentNode).forEach((value) =>
        images.push(new ImageModel(value.attribs.alt, value.attribs.src, 0)),
      );
    }
    checkboxItemBuilder.withImages(images);
  }
}