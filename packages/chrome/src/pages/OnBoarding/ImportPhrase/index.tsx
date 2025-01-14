import commonStyles from '../common.module.scss';
import Typo from '../../../components/Typo';
import Textarea from '../../../components/Textarea';
import Button from '../../../components/Button';
import Form from '../../../components/form/Form';
import FormControl from '../../../components/form/FormControl';
import { useForm } from 'react-hook-form';
import { getInputStateByFormState } from '../../../utils/form';
import { useApiClient } from '../../../hooks/useApiClient';

type FormData = {
  secret: string;
};

export type ImportPhraseProps = {
  onImported: (secret: string) => void;
  phrases?: string;
};

const ImportPhrase = (props: ImportPhraseProps) => {
  const apiClient = useApiClient();
  const form = useForm({
    mode: 'onBlur',
    defaultValues: {
      secret: props.phrases,
    },
  });

  async function handleSubmit(data: FormData) {
    const result = await apiClient.callFunc<string, boolean>(
      'wallet.validateMnemonic',
      data.secret
    );
    if (!result) {
      form.setError('secret', new Error('Phrase is not valid'));
      return;
    }
    if (props.onImported) props.onImported(data.secret);
  }

  return (
    <div className={commonStyles['container']}>
      <Typo.Title className={commonStyles['step-title']}>
        Input
        <br />
        Recovery
        <br />
        Phrase
      </Typo.Title>
      <Typo.Normal className={commonStyles['step-desc']}>
        From an existing wallet.
      </Typo.Normal>

      <section className={'mt-[24px] w-full'}>
        <Form form={form} onSubmit={handleSubmit}>
          <FormControl
            name={'secret'}
            registerOptions={{
              required: 'Phrase should not be empty',
            }}
          >
            <Textarea
              state={getInputStateByFormState(form.formState, 'secret')}
              className={'mt-[6px]'}
              elStyle={{
                height: '154px',
              }}
              placeholder={'paste recovery phrase or private key...'}
            />
          </FormControl>
          <Typo.Hints className={'mt-[6px]'}>
            Displayed when you first created your wallet.
          </Typo.Hints>

          <Button type={'submit'} state={'primary'} className={'mt-[24px]'}>
            Confirm and Import
          </Button>
        </Form>
      </section>
    </div>
  );
};

export default ImportPhrase;
